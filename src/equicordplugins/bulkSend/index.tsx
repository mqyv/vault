/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { sendMessage } from "@utils/discord";
import definePlugin from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, Text, TextArea, useState } from "@webpack/common";

function VaultIcon(props: any) {
    return (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <line x1="12" y1="3.2" x2="12" y2="7.5" />
            <line x1="12" y1="16.5" x2="12" y2="20.8" />
            <line x1="3.2" y1="12" x2="7.5" y2="12" />
            <line x1="16.5" y1="12" x2="20.8" y2="12" />
        </svg>
    );
}

async function sendAll(channelId: string, messages: string[]) {
    // Fire in order, back-to-back. RestAPI queues + auto-handles rate limits,
    // so this goes as fast as Discord allows while preserving order.
    for (const content of messages) {
        if (!content.trim()) continue;
        try {
            await sendMessage(channelId, { content });
        } catch {
            // ignore individual failures
        }
    }
}

function BulkSendModal(props: RenderModalProps & { channelId: string; }) {
    const [text, setText] = useState("");
    const messages = text.split("\n").filter(l => l.trim());

    return (
        <Modal
            {...props}
            title="Bulk Send"
            actions={[
                {
                    text: `Send all (${messages.length})`,
                    variant: "brand",
                    onClick() {
                        props.onClose();
                        sendAll(props.channelId, messages);
                    }
                },
                { text: "Cancel", variant: "link", onClick: props.onClose }
            ]}
        >
            <Text variant="text-sm/normal" style={{ marginBottom: 10, color: "var(--text-muted)" }}>
                One message per line. They are sent top to bottom, in order.
            </Text>
            <TextArea
                value={text}
                onChange={setText}
                rows={10}
                placeholder={"First message\nSecond message\nThird message..."}
                autoFocus
            />
        </Modal>
    );
}

const BulkSendButton: ChatBarButtonFactory = ({ channel }) => (
    <ChatBarButton
        tooltip="Bulk Send"
        onClick={() => openModal(props => <BulkSendModal {...props} channelId={channel.id} />)}
    >
        <VaultIcon />
    </ChatBarButton>
);

export default definePlugin({
    name: "BulkSend",
    description: "Adds a chat bar button to queue several messages (one per line) and send them all at once, in order.",
    authors: [{ name: "eqen", id: 1483151471183921346n }],
    chatBarButton: {
        icon: VaultIcon,
        render: BulkSendButton
    }
});
