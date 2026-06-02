/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import definePlugin, { OptionType } from "@utils/types";
import { Toasts, VoiceActions } from "@webpack/common";

const settings = definePluginSettings({
    fakeActive: {
        type: OptionType.BOOLEAN,
        description: "Currently appearing muted to others (toggle with the ghost button).",
        default: false
    },
    fakeDeafen: {
        type: OptionType.BOOLEAN,
        description: "Also appear deafened (you still hear everything). Right-click the ghost button to toggle.",
        default: false
    }
});

function feedback(msg: string) {
    Toasts.show({ message: msg, type: Toasts.Type.MESSAGE, id: Toasts.genId(), options: { position: Toasts.Position.BOTTOM } });
}

// force Discord to resend the voice state so the faked flags take effect now
function resend() {
    try {
        VoiceActions.toggleSelfMute();
        VoiceActions.toggleSelfMute();
    } catch { /* not in a voice channel */ }
}

function GhostIcon({ className, active = false }: { className?: string; active?: boolean; }) {
    return (
        <svg className={className} width={20} height={20} viewBox="0 0 24 24" fill={active ? "var(--status-danger)" : "currentColor"} aria-hidden="true">
            <path d="M12 2a8 8 0 0 0-8 8v10.5a1 1 0 0 0 1.6.8l1.9-1.4 1.9 1.4a1 1 0 0 0 1.2 0l1.4-1.05 1.4 1.05a1 1 0 0 0 1.2 0l1.9-1.4 1.9 1.4a1 1 0 0 0 1.6-.8V10a8 8 0 0 0-8-8Zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
        </svg>
    );
}

function FakeVoiceButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    const { fakeActive, fakeDeafen } = settings.use(["fakeActive", "fakeDeafen"]);

    const tooltipText = !fakeActive
        ? "Fake Voice: off (right-click: also fake deafen)"
        : fakeDeafen
            ? "Fake Voice: muted + deafened (you can still talk & hear)"
            : "Fake Voice: muted (right-click to add deafen)";

    return (
        <UserAreaButton
            tooltipText={hideTooltips ? void 0 : tooltipText}
            icon={<GhostIcon className={iconForeground} active={fakeActive} />}
            role="switch"
            aria-checked={fakeActive}
            redGlow={fakeActive}
            plated={nameplate != null}
            onClick={() => {
                settings.store.fakeActive = !settings.store.fakeActive;
                resend();
                feedback(settings.store.fakeActive
                    ? (settings.store.fakeDeafen ? "Fake Voice ON (mute + deafen)" : "Fake Voice ON (mute)")
                    : "Fake Voice OFF");
            }}
            onContextMenu={e => {
                e.preventDefault();
                settings.store.fakeDeafen = !settings.store.fakeDeafen;
                if (settings.store.fakeActive) resend();
                feedback(settings.store.fakeDeafen ? "Fake deafen: ON" : "Fake deafen: OFF");
            }}
        />
    );
}

export default definePlugin({
    name: "FakeVoice",
    description: "Appear muted (or muted + deafened) to others while you can still talk and hear. Ghost button next to mute/deafen; right-click to also fake deafen. Experimental.",
    authors: [{ name: "eqen", id: 1483151471183921346n }],
    tags: ["Voice"],
    dependencies: ["UserAreaAPI"],
    settings,

    // hook the voice-state payload Discord sends to the gateway
    patches: [
        {
            find: ".identifyStartTime))",
            replacement: {
                match: /self_mute:([^,]+),self_deaf:([^,]+)/,
                replace: "self_mute:$self.fakeMute($1),self_deaf:$self.fakeDeaf($2)"
            }
        }
    ],

    fakeMute(real: boolean) {
        return settings.store.fakeActive ? true : real;
    },
    fakeDeaf(real: boolean) {
        return settings.store.fakeActive && settings.store.fakeDeafen ? true : real;
    },

    userAreaButton: {
        icon: GhostIcon as any,
        render: FakeVoiceButton
    }
});
