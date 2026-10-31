/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { MediaEngineStore } from "@webpack/common";

// Discord sends your voice as mono Opus at the channel bitrate (64 kbps by default). This plugin rewrites the encoder
// options of every voice connection: Opus at up to 510 kbps (its maximum), stereo, applied live to the current call and
// to every call after. It can also add gain to the microphone on top of Discord's own input volume.
// A higher bitrate alone changes little while Krisp, noise suppression and automatic gain reshape the voice before it
// is encoded, so studio mode switches that processing off for calls without touching the user's Discord settings.

const logger = new Logger("BetterMicrophone");

/** Opus' own ceiling. */
const MAX_BITRATE_KBPS = 510;
/** Above this the voice starts to clip on loud speech. */
const MAX_GAIN_DB = 12;

const settings = definePluginSettings({
    bitrate: {
        type: OptionType.SLIDER,
        description: "Voice bitrate in kbps. Discord uses 64 by default; 510 is the best Opus can do.",
        markers: [64, 128, 192, 256, 320, 384, 448, MAX_BITRATE_KBPS],
        default: MAX_BITRATE_KBPS,
        stickToMarkers: false,
        onChange: () => applyToAllConnections()
    },
    stereo: {
        type: OptionType.BOOLEAN,
        description: "Send in stereo (Discord sends mono). Keeps the full image of a stereo microphone or audio interface.",
        default: true,
        onChange: () => applyToAllConnections()
    },
    studioMode: {
        type: OptionType.BOOLEAN,
        description: "Studio mode: during calls, turn off Krisp, noise suppression and automatic gain so your real voice is what gets sent. Your Discord voice settings stay as they are.",
        default: true,
        onChange: () => applyProcessing()
    },
    noEchoCancellation: {
        type: OptionType.BOOLEAN,
        description: "Also turn off echo cancellation. Headphones only: with speakers, the others hear themselves.",
        default: false,
        onChange: () => applyProcessing()
    },
    gainDb: {
        type: OptionType.SLIDER,
        description: `Extra microphone gain in dB, on top of Discord's input volume (0 = unchanged). Up to +${MAX_GAIN_DB} dB stays clean; turn off "Automatic gain control" in Voice settings or it will undo the boost.`,
        markers: [0, 3, 6, 9, MAX_GAIN_DB],
        default: 0,
        stickToMarkers: false,
        onChange: () => applyGain()
    }
});

const bitrate = () => Math.round(Math.min(MAX_BITRATE_KBPS, Math.max(8, settings.store.bitrate)) * 1000);
const channels = () => settings.store.stereo ? 2 : 1;
const gain = () => 10 ** (Math.min(MAX_GAIN_DB, Math.max(0, settings.store.gainDb)) / 20);

// --- encoder -------------------------------------------------------------------------------------

interface VoiceConnection {
    context: string;
    voiceBitrate?: number;
    conn: { setTransportOptions(options: Record<string, any>): unknown; };
    getCodecOptions(codec: string, ...rest: unknown[]): { audioEncoder: Record<string, any>; };
}

/** connection -> Discord's own setTransportOptions */
const originals = new Map<VoiceConnection, (options: Record<string, any>) => unknown>();

function override(options: Record<string, any>) {
    if (!options) return options;
    if ("encodingVoiceBitRate" in options) options.encodingVoiceBitRate = bitrate();
    if (options.audioEncoder) options.audioEncoder = { ...options.audioEncoder, channels: channels(), rate: bitrate() };
    return options;
}

function encoderOptions(c: VoiceConnection) {
    return {
        encodingVoiceBitRate: bitrate(),
        audioEncoder: { ...c.getCodecOptions("opus").audioEncoder, channels: channels(), rate: bitrate() }
    };
}

function hook(c: VoiceConnection) {
    // voice only: screen share audio ("stream") has its own settings
    if (c?.context !== "default" || typeof c.conn?.setTransportOptions !== "function" || originals.has(c)) return;
    hookProcessing(c);
    const original = c.conn.setTransportOptions;
    originals.set(c, original);
    c.conn.setTransportOptions = function (this: unknown, options: Record<string, any>) {
        try { override(options); } catch (e) { logger.error("Could not adjust voice options", e); }
        return Reflect.apply(original, this, [options]);
    };
    apply(c);
    applyProcessing();
}

function apply(c: VoiceConnection) {
    try {
        c.conn.setTransportOptions(encoderOptions(c));
    } catch (e) {
        logger.error("Could not apply voice options", e);
    }
}

function applyToAllConnections() {
    originals.forEach((_, c) => apply(c));
}

function unhookAll() {
    originals.forEach((original, c) => {
        c.conn.setTransportOptions = original;
        // back to what Discord would send on its own
        try {
            original.call(c.conn, {
                encodingVoiceBitRate: c.voiceBitrate ?? 64000,
                audioEncoder: c.getCodecOptions("opus").audioEncoder
            });
        } catch (e) {
            logger.error("Could not restore voice options", e);
        }
    });
    originals.clear();
}

// --- voice processing (studio mode) --------------------------------------------------------------

// Discord applies Krisp, noise suppression, gain control and echo cancellation through these methods of its voice
// connection class, which forward to the native voice engine. Wrapping them on the prototype catches both our calls and
// Discord's own (on joining a call, or when the user changes a setting), so the processing stays off for the whole call.
const PROCESSING = ["setNoiseCancellation", "setNoiseSuppression", "setAutomaticGainControl", "setEchoCancellation"] as const;
type Processing = typeof PROCESSING[number];

let processingProto: Record<Processing, (value: any) => unknown> | null = null;
const originalProcessing = new Map<Processing, (value: any) => unknown>();
let lastConnection: any = null;

function forced(method: Processing, value: any) {
    const { studioMode, noEchoCancellation } = settings.store;
    switch (method) {
        case "setNoiseCancellation":
        case "setNoiseSuppression":
            return studioMode ? false : value;
        case "setAutomaticGainControl":
            return studioMode && value && typeof value === "object" ? { ...value, enabled: false } : value;
        case "setEchoCancellation":
            return noEchoCancellation ? false : value;
    }
}

function hookProcessing(c: any) {
    lastConnection = c;
    if (processingProto) return;
    const proto = Object.getPrototypeOf(c);
    if (!PROCESSING.every(m => typeof proto?.[m] === "function")) {
        logger.warn("Voice processing methods not found, studio mode unavailable");
        return;
    }
    processingProto = proto;
    for (const m of PROCESSING) {
        const original = proto[m];
        originalProcessing.set(m, original);
        proto[m] = function (this: unknown, value: any) {
            let next = value;
            try { next = forced(m, value); } catch (e) { logger.error("Could not adjust voice processing", e); }
            return Reflect.apply(original, this, [next]);
        };
    }
}

/** Re-sends the user's own settings; while hooked, the wrappers above swap in the studio values. */
function sendUserProcessing(c: any) {
    try {
        c.setNoiseCancellation(MediaEngineStore.getNoiseCancellation());
        c.setNoiseSuppression(MediaEngineStore.getNoiseSuppression());
        c.setEchoCancellation(MediaEngineStore.getEchoCancellation());
        c.setAutomaticGainControl({ ...c.automaticGainControl, enabled: MediaEngineStore.getAutomaticGainControl() });
    } catch (e) {
        logger.error("Could not apply voice processing", e);
    }
}

function applyProcessing() {
    if (lastConnection && processingProto) sendUserProcessing(lastConnection);
}

function unhookProcessing() {
    if (!processingProto) return;
    for (const [m, original] of originalProcessing) processingProto[m] = original;
    originalProcessing.clear();
    processingProto = null;
    // back to exactly what the user set in Discord
    if (lastConnection) sendUserProcessing(lastConnection);
    lastConnection = null;
}

// --- gain ----------------------------------------------------------------------------------------

let originalSetInputVolume: ((volume: number) => void) | null = null;
let ownProperty = false;

/** Discord passes its input volume (0-100) here; the native engine takes it as a linear gain (volume / 100). */
function hookInputVolume(engine: any) {
    if (originalSetInputVolume) return;
    originalSetInputVolume = engine.setInputVolume;
    ownProperty = Object.hasOwn(engine, "setInputVolume");
    engine.setInputVolume = function (this: unknown, volume: number) {
        return originalSetInputVolume!.call(this, volume * gain());
    };
}

function applyGain() {
    try {
        MediaEngineStore.getMediaEngine().setInputVolume(MediaEngineStore.getInputVolume());
    } catch (e) {
        logger.error("Could not apply microphone gain", e);
    }
}

function unhookInputVolume(engine: any) {
    if (!originalSetInputVolume) return;
    if (ownProperty) engine.setInputVolume = originalSetInputVolume;
    else delete engine.setInputVolume; // back to the prototype's method
    originalSetInputVolume = null;
    applyGain();
}

// --- lifecycle -----------------------------------------------------------------------------------

const onConnection = (c: VoiceConnection) => hook(c);

export default definePlugin({
    name: "BetterMicrophone",
    description: "Best possible microphone quality in calls: Opus up to 510 kbps (Discord uses 64), stereo, and studio mode, which turns off Krisp and the other voice filters during calls. Applied right away. Optional extra gain in dB. Inspired by PhilsBetterMicrophone by philhk (Equicord).",
    authors: [EquicordDevs.eqen],
    tags: ["Voice"],
    enabledByDefault: true,
    settings,

    start() {
        const engine: any = MediaEngineStore.getMediaEngine();
        engine.emitter?.on?.("connection", onConnection);
        engine.connections?.forEach?.((c: VoiceConnection) => hook(c));
        hookInputVolume(engine);
        applyGain();
    },

    stop() {
        const engine: any = MediaEngineStore.getMediaEngine();
        engine.emitter?.removeListener?.("connection", onConnection);
        unhookAll();
        unhookProcessing();
        unhookInputVolume(engine);
    }
});
