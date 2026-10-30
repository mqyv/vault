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
    const original = c.conn.setTransportOptions;
    originals.set(c, original);
    c.conn.setTransportOptions = function (this: unknown, options: Record<string, any>) {
        try { override(options); } catch (e) { logger.error("Could not adjust voice options", e); }
        return Reflect.apply(original, this, [options]);
    };
    apply(c);
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
    description: "Best possible microphone quality in calls: Opus up to 510 kbps (Discord uses 64), stereo, applied right away. Optional extra gain in dB. Inspired by PhilsBetterMicrophone by philhk (Equicord).",
    authors: [EquicordDevs.eqen],
    tags: ["Voice"],
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
        unhookInputVolume(engine);
    }
});
