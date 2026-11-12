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
        description: "Débit de la voix en kbps. Discord utilise 64 par défaut ; 510 est le maximum d'Opus.",
        markers: [64, 128, 192, 256, 320, 384, 448, MAX_BITRATE_KBPS],
        default: MAX_BITRATE_KBPS,
        stickToMarkers: false,
        onChange: () => applyToAllConnections()
    },
    stereo: {
        type: OptionType.BOOLEAN,
        description: "Envoyer en stéréo (Discord envoie en mono). Garde toute l'image d'un micro stéréo ou d'une interface audio.",
        default: true,
        onChange: () => applyToAllConnections()
    },
    studioMode: {
        type: OptionType.BOOLEAN,
        description: "Micro natif : pendant les appels, envoie ton micro tel quel. Coupe Krisp (réduction de bruit et détection de la voix), la réduction de bruit standard et le gain automatique, contourne le traitement de Windows et lève les limites de fréquence d'échantillonnage et de canaux de Discord. Tes réglages vocaux Discord ne changent pas.",
        default: true,
        onChange: () => { applyProcessing(); applyToAllConnections(); }
    },
    disableEchoCancellation: {
        type: OptionType.BOOLEAN,
        description: "Coupe aussi l'annulation d'écho, pour un signal totalement intact. Utilise un casque : avec des haut-parleurs, les autres s'entendent eux-mêmes.",
        default: true,
        onChange: () => applyProcessing()
    },
    gainDb: {
        type: OptionType.SLIDER,
        description: `Gain supplémentaire du micro en dB, en plus du volume d'entrée de Discord (0 = inchangé). Jusqu'à +${MAX_GAIN_DB} dB reste propre ; désactive « Contrôle automatique du gain » dans les réglages vocaux, sinon il annule l'augmentation.`,
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

/** Discord tells Opus to expect 30% packet loss, which spends part of the bitrate on redundancy. */
const NATIVE_PACKET_LOSS = 0.05;

function override(options: Record<string, any>) {
    if (!options) return options;
    if ("encodingVoiceBitRate" in options) options.encodingVoiceBitRate = bitrate();
    if (options.audioEncoder) options.audioEncoder = { ...options.audioEncoder, channels: channels(), rate: bitrate() };
    if (settings.store.studioMode) {
        if ("packetLossRate" in options) options.packetLossRate = NATIVE_PACKET_LOSS;
        // voice activity still on, but decided by level instead of Krisp, which cuts music, breaths and quiet words
        if (options.inputModeOptions && "vadUseKrisp" in options.inputModeOptions)
            options.inputModeOptions = { ...options.inputModeOptions, vadUseKrisp: false };
    }
    return options;
}

function encoderOptions(c: VoiceConnection) {
    const t = (c as any).getConnectionTransportOptions?.() ?? {};
    return {
        encodingVoiceBitRate: bitrate(),
        audioEncoder: { ...c.getCodecOptions("opus").audioEncoder, channels: channels(), rate: bitrate() },
        // re-sent so override() can apply (or, with native mode off, undo) its changes to them
        ...(t.inputModeOptions && { inputMode: t.inputMode, inputModeOptions: t.inputModeOptions }),
        ...("packetLossRate" in t && { packetLossRate: t.packetLossRate })
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
            const t = (c as any).getConnectionTransportOptions?.() ?? {};
            original.call(c.conn, {
                encodingVoiceBitRate: c.voiceBitrate ?? 64000,
                audioEncoder: c.getCodecOptions("opus").audioEncoder,
                ...(t.inputModeOptions && { inputMode: t.inputMode, inputModeOptions: t.inputModeOptions }),
                ...("packetLossRate" in t && { packetLossRate: t.packetLossRate })
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
const PROCESSING = ["setNoiseCancellation", "setNoiseSuppression", "setAutomaticGainControl", "setEchoCancellation", "setNoiseCancellationDuringProcessing"] as const;
type Processing = typeof PROCESSING[number];

let processingProto: Record<Processing, (value: any) => unknown> | null = null;
const originalProcessing = new Map<Processing, (value: any) => unknown>();
let lastConnection: any = null;

function forced(method: Processing, value: any) {
    const { studioMode, disableEchoCancellation } = settings.store;
    switch (method) {
        case "setNoiseCancellation":
        case "setNoiseSuppression":
        case "setNoiseCancellationDuringProcessing":
            return studioMode ? false : value;
        case "setAutomaticGainControl":
            return studioMode && value && typeof value === "object" ? { ...value, enabled: false } : value;
        case "setEchoCancellation":
            return disableEchoCancellation ? false : value;
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
        proto[m] = function (this: any, value: any) {
            // keep what Discord asked for, so it can be put back exactly when the plugin stops
            this["__vaultUser_" + m] = value;
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
        const ncdp = c.__vaultUser_setNoiseCancellationDuringProcessing ?? c.noiseCancellationDuringProcessing;
        if (ncdp != null) c.setNoiseCancellationDuringProcessing(ncdp);
    } catch (e) {
        logger.error("Could not apply voice processing", e);
    }
    applyEngine();
}

// Engine-wide: Windows' own microphone processing, and Discord's caps on the voice sample rate and channel count.
function applyEngine() {
    try {
        const engine: any = MediaEngineStore.getMediaEngine();
        const native = settings.store.studioMode && processingProto != null;
        engine.setAudioInputBypassSystemProcessing?.(native || MediaEngineStore.getBypassSystemInputProcessing());
        if (native) {
            engine.setVoiceSampleRateCap?.(48000);
            engine.setVoiceChannelCountCap?.(channels());
        }
    } catch (e) {
        logger.error("Could not apply engine options", e);
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
    description: "Meilleure qualité de micro possible en appel : Opus jusqu'à 510 kbps (Discord utilise 64), stéréo, et mode studio qui coupe Krisp et les autres filtres vocaux pendant les appels. Appliqué tout de suite. Gain supplémentaire en dB en option. Inspiré de PhilsBetterMicrophone par philhk (Equicord).",
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
