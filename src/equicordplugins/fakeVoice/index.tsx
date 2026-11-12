/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { FakeVoiceIcon } from "@components/VaultIcons";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { MediaEngineStore, VoiceActions } from "@webpack/common";

// Independent fake states. Your REAL mute/deafen stay off, so you always keep
// talking and hearing — only what others see is faked.
const settings = definePluginSettings({
    appearMuted: {
        type: OptionType.BOOLEAN,
        description: "Apparaître en sourdine micro pour les autres (tu peux quand même parler). Clic gauche sur le bouton fantôme.",
        default: false,
        onChange: () => resend()
    },
    appearDeafened: {
        type: OptionType.BOOLEAN,
        description: "Apparaître en sourdine casque pour les autres (tu entends quand même). Clic droit sur le bouton fantôme.",
        default: false,
        onChange: () => resend()
    }
});

// The gateway socket and the arguments of the last voice state Discord sent, captured by the patch below.
let lastVoiceState: [socket: { voiceStateUpdate(state: unknown): void; }, state: { channelId?: string | null; }] | null = null;

// Resend Discord's own last voice state once, so the faked flags reach the server now. Toggling mute twice instead
// sends three updates that can arrive out of order, and plays the mute sound.
function resend() {
    try {
        if (lastVoiceState?.[1]?.channelId != null) lastVoiceState[0].voiceStateUpdate(lastVoiceState[1]);
        else { VoiceActions.toggleSelfMute(); VoiceActions.toggleSelfMute(); }
    } catch { /* not in a voice channel */ }
    // redraw your own icons in the voice channel list (see the second patch)
    try { (MediaEngineStore as any).emitChange(); } catch { }
}

function describe(muted: boolean, deafened: boolean) {
    if (muted && deafened) return "Fake Voice: muted + deafened (you still talk & hear)";
    if (muted) return "Fake Voice: muted (you still talk) — right-click: deafen";
    if (deafened) return "Fake Voice: deafened (you still hear) — left-click: mute";
    return "Fake Voice: off (left-click: mute, right-click: deafen)";
}

function FakeVoiceButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    const { appearMuted, appearDeafened } = settings.use(["appearMuted", "appearDeafened"]);
    const on = appearMuted || appearDeafened;

    return (
        <UserAreaButton
            tooltipText={hideTooltips ? void 0 : describe(appearMuted, appearDeafened)}
            icon={<FakeVoiceIcon className={iconForeground} active={on} />}
            role="switch"
            aria-checked={on}
            redGlow={on}
            plated={nameplate != null}
            onClick={() => {
                settings.store.appearMuted = !settings.store.appearMuted; // onChange resends
            }}
            onContextMenu={e => {
                e.preventDefault();
                settings.store.appearDeafened = !settings.store.appearDeafened; // onChange resends
            }}
        />
    );
}

export default definePlugin({
    name: "FakeVoice",
    description: "Apparaître en sourdine micro et/ou casque pour les autres tout en continuant à parler et à entendre. Bouton fantôme à côté de micro/casque : clic gauche = micro coupé, clic droit = casque coupé (indépendants). Expérimental.",
    authors: [EquicordDevs.eqen],
    enabledByDefault: true,
    tags: ["Voice"],
    dependencies: ["UserAreaAPI"],
    settings,

    // hook the voice-state payload Discord sends to the gateway
    patches: [
        {
            // the gateway socket's voiceStateUpdate (".identifyStartTime))" now points at the incoming-state parser)
            find: /\.shouldIncludePreferredRegion\(\)&&\(\i\.preferred_region=/,
            replacement: [
                {
                    match: /self_mute:([^,]+),self_deaf:([^,]+)/,
                    replace: "self_mute:$self.fakeMute($1),self_deaf:$self.fakeDeaf($2)"
                },
                {
                    // remember Discord's last voice state so a toggle can resend exactly it
                    match: /voiceStateUpdate\((\i)\)\{/,
                    replace: "$&$self.remember(this,$1);"
                }
            ]
        },
        {
            // For your own account Discord draws the mute/deafen icons in the voice channel list from your real
            // microphone state, not from the server's. Show the faked state there too, as everyone else sees it.
            find: ".isSelfMutedTemporarily(),selfDeaf:",
            replacement: {
                match: /selfMute:(\i\.\i\.isSelfMute\(\)\|\|\i\.\i\.isSelfMutedTemporarily\(\)),selfDeaf:(\i\.\i\.isSelfDeaf\(\))/,
                replace: "selfMute:$self.fakeMute($1),selfDeaf:$self.fakeDeaf($2)"
            }
        }
    ],

    resend,

    remember(socket: any, state: any) {
        lastVoiceState = [socket, state];
    },

    fakeMute(real: boolean) {
        return settings.store.appearMuted ? true : real;
    },
    fakeDeaf(real: boolean) {
        return settings.store.appearDeafened ? true : real;
    },

    userAreaButton: {
        icon: FakeVoiceIcon as any,
        render: FakeVoiceButton
    }
});
