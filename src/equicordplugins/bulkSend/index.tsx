/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { sendMessage } from "@utils/discord";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Button, Modal, openModal, Text, TextInput, useState } from "@webpack/common";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function sendAll(channelId: string, messages: string[]) {
    for (const msg of messages) {
        const content = msg.trim();
        if (!content) continue;
        try {
            await sendMessage(channelId, { content });
        } catch {
            // RestAPI auto-handles rate limits; ignore individual failures
        }
        await sleep(250); // small gap to stay within Discord's limits
    }
}

function BulkSendModal(props: RenderModalProps & { channelId: string; }) {
    const { channelId } = props;
    const [messages, setMessages] = useState<string[]>([""]);

    const update = (i: number, val: string) => setMessages(m => m.map((x, idx) => idx === i ? val : x));
    const add = () => setMessages(m => [...m, ""]);
    const remove = (i: number) => setMessages(m => m.length === 1 ? [""] : m.filter((_, idx) => idx !== i));
    const move = (i: number, dir: -1 | 1) => setMessages(m => {
        const j = i + dir;
        if (j < 0 || j >= m.length) return m;
        const copy = [...m];
        [copy[i], copy[j]] = [copy[j], copy[i]];
        return copy;
    });

    const count = messages.filter(m => m.trim()).length;

    return (
        <Modal
            {...props}
            title="Bulk Send"
            actions={[
                {
                    text: `Send all (${count})`,
                    variant: "brand",
                    onClick() {
                        const toSend = messages.filter(m => m.trim());
                        props.onClose();
                        sendAll(channelId, toSend);
                    }
                },
                {
                    text: "Cancel",
                    variant: "link",
                    onClick: props.onClose
                }
            ]}
        >
            <Text variant="text-sm/normal" style={{ marginBottom: 12, color: "var(--text-muted)" }}>
                Add the messages you want, reorder them, then hit “Send all”. They are sent in this order.
            </Text>

            {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                    <Text variant="text-xs/semibold" style={{ width: 18, color: "var(--text-muted)" }}>{i + 1}</Text>
                    <div style={{ flexGrow: 1 }}>
                        <TextInput value={msg} placeholder={`Message ${i + 1}`} onChange={(v: string) => update(i, v)} />
                    </div>
                    <Button size={Button.Sizes.MIN} color={Button.Colors.PRIMARY} onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                    <Button size={Button.Sizes.MIN} color={Button.Colors.PRIMARY} onClick={() => move(i, 1)} disabled={i === messages.length - 1}>↓</Button>
                    <Button size={Button.Sizes.MIN} color={Button.Colors.RED} onClick={() => remove(i)}>✕</Button>
                </div>
            ))}

            <Button size={Button.Sizes.SMALL} color={Button.Colors.PRIMARY} look={Button.Looks.LINK} onClick={add}>
                + Add message
            </Button>
        </Modal>
    );
}

const BulkSendButton: ChatBarButtonFactory = ({ channel }) => (
    <ChatBarButton
        tooltip="Bulk Send"
        onClick={() => openModal(props => <BulkSendModal {...props} channelId={channel.id} />)}
    >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    </ChatBarButton>
);

export default definePlugin({
    name: "BulkSend",
    description: "Adds a chat bar button to queue several messages and send them all at once, in order.",
    authors: [{ name: "Vault", id: 0n }],
    renderChatBarButton: BulkSendButton
});
