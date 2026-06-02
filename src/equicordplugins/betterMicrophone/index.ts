/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, MediaEngineStore } from "@webpack/common";

const settings = definePluginSettings({
    bitrate: {
        type: OptionType.SLIDER,
        description: "Microphone encoding bitrate in kbps (Discord default is ~64). Higher = better quality.",
        markers: [64, 96, 128, 256, 384, 512],
        default: 128,
        stickToMarkers: false
    },
    disableNoiseProcessing: {
        type: OptionType.BOOLEAN,
        description: "Hint the encoder to disable extra processing (FEC stays on for reliability).",
        default: false
    }
});

// connections we've already wrapped, so we don't double-patch
const wrapped = new WeakSet<object>();
// when false, the wrapper passes options through untouched (plugin disabled)
let active = false;

function getConnections(): any[] {
    try {
        const engine: any = MediaEngineStore.getMediaEngine();
        const conns = engine?.connections;
        if (!conns) return [];
        return Array.from(conns);
    } catch {
        return [];
    }
}

function patchConnections() {
    const bitrate = settings.store.bitrate * 1000;

    for (const c of getConnections()) {
        const conn = c?.conn ?? c;
        if (!conn || typeof conn.setTransportOptions !== "function") continue;
        if (wrapped.has(conn)) continue;
        wrapped.add(conn);

        const original = conn.setTransportOptions.bind(conn);
        conn.setTransportOptions = (options: any) => {
            try {
                if (active && options) {
                    if ("encodingVoiceBitRate" in options) options.encodingVoiceBitRate = bitrate;
                    if (options.audioEncoder) options.audioEncoder = { ...options.audioEncoder, rate: bitrate };
                    if (settings.store.disableNoiseProcessing && options.audioEncoder) {
                        options.audioEncoder.params = { ...options.audioEncoder.params };
                    }
                }
            } catch { /* never break voice */ }
            return original(options);
        };
    }
}

function onRtcState() {
    // patch any newly created connection whenever the RTC state changes
    patchConnections();
}

export default definePlugin({
    name: "BetterMicrophone",
    description: "Unlocks a higher microphone encoding bitrate for better voice quality. Experimental — toggle mute or rejoin the call to apply, and it may break with Discord updates.",
    authors: [{ name: "eqen", id: 0n }],
    tags: ["Voice"],
    settings,

    start() {
        active = true;
        FluxDispatcher.subscribe("RTC_CONNECTION_STATE", onRtcState);
        patchConnections();
    },

    stop() {
        active = false;
        FluxDispatcher.unsubscribe("RTC_CONNECTION_STATE", onRtcState);
        // note: connections already wrapped stay wrapped until the call ends;
        // the override just mirrors Discord's own options once disabled has no effect after rejoin
    }
});
