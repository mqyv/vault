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
import { showToast, VoiceActions } from "@webpack/common";

// Independent fake states. Your REAL mute/deafen stay off, so you always keep
// talking and hearing — only what others see is faked.
const settings = definePluginSettings({
    appearMuted: {
        type: OptionType.BOOLEAN,
        description: "Appear muted to others (you can still talk). Left-click the ghost button.",
        default: false
    },
    appearDeafened: {
        type: OptionType.BOOLEAN,
        description: "Appear deafened to others (you can still hear). Right-click the ghost button.",
        default: false
    }
});

function feedback(msg: string) {
    showToast({ text: msg, variant: "success" });
}

// force Discord to resend the voice state so the faked flags take effect now
function resend() {
    try {
        VoiceActions.toggleSelfMute();
        VoiceActions.toggleSelfMute();
    } catch { /* not in a voice channel */ }
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
                settings.store.appearMuted = !settings.store.appearMuted;
                resend();
                feedback(describe(settings.store.appearMuted, settings.store.appearDeafened));
            }}
            onContextMenu={e => {
                e.preventDefault();
                settings.store.appearDeafened = !settings.store.appearDeafened;
                resend();
                feedback(describe(settings.store.appearMuted, settings.store.appearDeafened));
            }}
        />
    );
}

export default definePlugin({
    name: "FakeVoice",
    description: "Appear muted and/or deafened to others while you keep talking and hearing. Ghost button next to mute/deafen: left-click = mute, right-click = deafen (independent). Experimental.",
    authors: [EquicordDevs.eqen],
    tags: ["Voice"],
    dependencies: ["UserAreaAPI"],
    settings,

    // hook the voice-state payload Discord sends to the gateway
    patches: [
        {
            // the gateway socket's voiceStateUpdate (".identifyStartTime))" now points at the incoming-state parser)
            find: /\.shouldIncludePreferredRegion\(\)&&\(\i\.preferred_region=/,
            replacement: {
                match: /self_mute:([^,]+),self_deaf:([^,]+)/,
                replace: "self_mute:$self.fakeMute($1),self_deaf:$self.fakeDeaf($2)"
            }
        }
    ],

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
