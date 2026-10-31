/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { BulkSendIcon } from "@components/VaultIcons";
import { EquicordDevs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, showToast, TextArea, TextInput, useEffect, UserStore, useState } from "@webpack/common";

const settings = definePluginSettings({
    delayMs: {
        type: OptionType.NUMBER,
        description: "Delay between each message, in milliseconds (0 = as fast as Discord allows).",
        default: 0
    }
});

// Braille Pattern Blank (U+2800): Discord shows it as empty space but, unlike spaces, does not trim it away,
// so a message made only of it is accepted. One per line makes a tall blank block.
const BLANK = "⠀";
const blankBlock = (limit: number) => Array.from({ length: Math.floor((limit + 1) / 2) }, () => BLANK).join("\n").slice(0, limit);
/** Discord's message length limit: 4000 with Nitro, 2000 otherwise. */
const messageLimit = () => ((UserStore.getCurrentUser() as any)?.premiumType ?? 0) > 0 ? 4000 : 2000;

// ---- the running job (one at a time), shared with the chat bar button so it can show Stop -------

interface Job { channelId: string; sent: number; stop: boolean; }
let job: Job | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

function useJob() {
    const [, rerender] = useState(0);
    useEffect(() => {
        const l = () => rerender(n => n + 1);
        listeners.add(l);
        return () => void listeners.delete(l);
    }, []);
    return job;
}

function stopJob() {
    if (job) job.stop = true;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Sends the messages in order, `rounds` times (0 = until stopped). RestAPI waits out Discord's rate limits by itself,
 * so a delay of 0 still never hammers the API.
 */
async function run(channelId: string, messages: string[], delayMs: number, rounds: number) {
    if (job) return showToast({ text: "Bulk Send is already running, stop it first.", variant: "critical" });
    const current: Job = job = { channelId, sent: 0, stop: false };
    notify();
    const delay = Math.max(0, delayMs || 0);
    try {
        for (let round = 0; rounds === 0 || round < rounds; round++) {
            for (const content of messages) {
                if (current.stop) return;
                try {
                    await sendMessage(channelId, { content });
                    current.sent++;
                    notify();
                } catch {
                    // a single failure (deleted channel, missing permission...) should not end the run
                }
                if (delay > 0) await sleep(delay);
            }
        }
    } finally {
        job = null;
        notify();
        showToast({ text: `Bulk Send: ${current.sent} message${current.sent === 1 ? "" : "s"} sent${current.stop ? " (stopped)" : ""}.`, variant: "success" });
    }
}

// ---- modal ----------------------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: any; }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <Span weight="semibold" style={{ whiteSpace: "nowrap", minWidth: 190 }}>{label}</Span>
            {children}
        </div>
    );
}

function BulkSendModal(props: RenderModalProps & { channelId: string; }) {
    const [text, setText] = useState("");
    const [whole, setWhole] = useState(false);
    const [delay, setDelay] = useState(String(settings.store.delayMs ?? 0));
    const [repeat, setRepeat] = useState("1");
    const [forever, setForever] = useState(false);

    const limit = messageLimit();
    const messages = whole
        ? (text.trim() ? [text.slice(0, limit)] : [])
        : text.split("\n").filter(l => l.trim()).map(l => l.slice(0, limit));
    const delayMs = Math.max(0, parseInt(delay, 10) || 0);
    const rounds = forever ? 0 : Math.max(1, parseInt(repeat, 10) || 1);
    const total = forever ? "∞" : String(messages.length * rounds);
    const isBlank = text.length > 0 && !text.replace(new RegExp(`[${BLANK}\\n]`, "g"), "");

    return (
        <Modal
            {...props}
            title="Bulk Send"
            actions={[
                {
                    text: `Send (${total})`,
                    variant: "primary",
                    disabled: messages.length === 0,
                    onClick() {
                        settings.store.delayMs = delayMs; // remember for next time
                        props.onClose();
                        run(props.channelId, messages, delayMs, rounds);
                    }
                },
                { text: "Cancel", variant: "link", onClick: props.onClose }
            ]}
        >
            <Paragraph color="text-muted" style={{ marginBottom: 10 }}>
                {whole
                    ? "The whole text is sent as one message."
                    : "One message per line. They are sent top to bottom, in order."}
            </Paragraph>
            <TextArea
                value={isBlank ? "" : text}
                onChange={v => { setText(v); }}
                rows={9}
                placeholder={isBlank ? `Invisible block ready: ${text.length} characters, sent as one message.` : "First message\nSecond message\nThird message..."}
                autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <Button size="small" onClick={() => { setText(blankBlock(limit)); setWhole(true); }}>
                    Invisible block ({blankBlock(limit).length} characters)
                </Button>
                <Button size="small" variant="secondary" onClick={() => setWhole(!whole)}>
                    {whole ? "Split into one message per line" : "Send the whole text as one message"}
                </Button>
            </div>
            <Row label="Delay between messages (ms)">
                <div style={{ width: 110 }}>
                    <TextInput type="number" value={delay} onChange={(v: string) => setDelay(v)} placeholder="0" />
                </div>
            </Row>
            <Row label="Repeat">
                <div style={{ width: 110 }}>
                    <TextInput type="number" value={repeat} onChange={(v: string) => setRepeat(v)} placeholder="1" disabled={forever} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--text-default)" }}>
                    <input type="checkbox" checked={forever} onChange={e => setForever(e.currentTarget.checked)} />
                    Continuously, until I press Stop
                </label>
            </Row>
            <Paragraph color="text-muted" style={{ marginTop: 12 }}>
                While it runs, the Bulk Send button in the chat bar turns into Stop. Sending a lot of messages quickly
                can get an account rate-limited or flagged by Discord.
            </Paragraph>
        </Modal>
    );
}

const BulkSendButton: ChatBarButtonFactory = ({ channel }) => {
    const running = useJob();
    if (running) {
        return (
            <ChatBarButton tooltip={`Stop Bulk Send (${running.sent} sent)`} onClick={stopJob}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="var(--status-danger)" /></svg>
            </ChatBarButton>
        );
    }
    return (
        <ChatBarButton
            tooltip="Bulk Send"
            onClick={() => openModal(props => <BulkSendModal {...props} channelId={channel.id} />)}
        >
            <BulkSendIcon />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "BulkSend",
    description: "Adds a chat bar button to send several messages in order (one per line, or the whole text as one), repeat them or keep sending until you press Stop. Includes an invisible block of blank characters.",
    authors: [EquicordDevs.eqen],
    enabledByDefault: true,
    settings,
    chatBarButton: {
        icon: BulkSendIcon,
        render: BulkSendButton
    },

    // stops a running send when the plugin is turned off
    stop() {
        stopJob();
    },

    // for checking from the console
    getJob: () => job,
    stopSending: stopJob,
    run
});
