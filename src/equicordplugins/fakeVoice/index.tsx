/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import definePlugin from "@utils/types";
import { Toasts, VoiceActions } from "@webpack/common";

// runtime state: appear muted (and optionally deafened) to others while you can
// still talk and hear. Toggled from the chat bar button.
let active = false;       // fake-mute active (others see you muted)
let includeDeaf = false;  // also fake-deafen (others see you deafened)

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

function GhostIcon({ active: on = false }: { active?: boolean; }) {
    return (
        <svg width={20} height={20} viewBox="0 0 24 24" fill={on ? "var(--status-danger)" : "currentColor"} aria-hidden="true">
            <path d="M12 2a8 8 0 0 0-8 8v10.5a1 1 0 0 0 1.6.8l1.9-1.4 1.9 1.4a1 1 0 0 0 1.2 0l1.4-1.05 1.4 1.05a1 1 0 0 0 1.2 0l1.9-1.4 1.9 1.4a1 1 0 0 0 1.6-.8V10a8 8 0 0 0-8-8Zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
        </svg>
    );
}

const FakeVoiceButton: ChatBarButtonFactory = () => {
    function tooltip() {
        if (!active) return "Fake Voice: off (right-click: also fake deafen)";
        return includeDeaf
            ? "Fake Voice: muted + deafened (you can still talk & hear)"
            : "Fake Voice: muted (you can still talk) — right-click to add deafen";
    }

    return (
        <ChatBarButton
            tooltip={tooltip()}
            onClick={() => {
                active = !active;
                resend();
                feedback(active
                    ? (includeDeaf ? "Fake Voice ON (mute + deafen)" : "Fake Voice ON (mute)")
                    : "Fake Voice OFF");
            }}
            onContextMenu={e => {
                e.preventDefault();
                includeDeaf = !includeDeaf;
                if (active) resend();
                feedback(includeDeaf ? "Fake deafen: ON" : "Fake deafen: OFF");
            }}
        >
            <GhostIcon active={active} />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "FakeVoice",
    description: "Appear muted (or muted + deafened) to others while you can still talk and hear. Toggle with the ghost button in the chat bar; right-click to also fake deafen. Experimental.",
    authors: [{ name: "eqen", id: 1483151471183921346n }],
    tags: ["Voice"],

    // hook the voice-state payload that Discord sends to the gateway
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
        return active ? true : real;
    },
    fakeDeaf(real: boolean) {
        return active && includeDeaf ? true : real;
    },

    chatBarButton: {
        icon: GhostIcon as any,
        render: FakeVoiceButton
    }
});
