/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import { BulkSendIcon } from "@components/VaultIcons";
import { EquicordDevs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, Text, TextArea, TextInput, useState } from "@webpack/common";

const settings = definePluginSettings({
    delayMs: {
        type: OptionType.NUMBER,
        description: "Delay between each message, in milliseconds (0 = as fast as possible).",
        default: 0
    }
});

async function sendAll(channelId: string, messages: string[], delayMs: number) {
    // Fire in order. RestAPI queues + auto-handles rate limits.
    const delay = Math.max(0, delayMs || 0);
    for (const content of messages) {
        if (!content.trim()) continue;
        try {
            await sendMessage(channelId, { content });
        } catch {
            // ignore individual failures
        }
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }
}

function BulkSendModal(props: RenderModalProps & { channelId: string; }) {
    const [text, setText] = useState("");
    const [delay, setDelay] = useState(String(settings.store.delayMs ?? 0));
    const messages = text.split("\n").filter(l => l.trim());
    const delayMs = Math.max(0, parseInt(delay, 10) || 0);

    return (
        <Modal
            {...props}
            title="Bulk Send"
            actions={[
                {
                    text: `Send all (${messages.length})`,
                    variant: "brand",
                    onClick() {
                        settings.store.delayMs = delayMs; // remember for next time
                        props.onClose();
                        sendAll(props.channelId, messages, delayMs);
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
                rows={9}
                placeholder={"First message\nSecond message\nThird message..."}
                autoFocus
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <Text variant="text-sm/semibold" style={{ whiteSpace: "nowrap" }}>Delay between messages (ms)</Text>
                <div style={{ width: 110 }}>
                    <TextInput
                        type="number"
                        value={delay}
                        onChange={(v: string) => setDelay(v)}
                        placeholder="0"
                    />
                </div>
            </div>
        </Modal>
    );
}

const BulkSendButton: ChatBarButtonFactory = ({ channel }) => (
    <ChatBarButton
        tooltip="Bulk Send"
        onClick={() => openModal(props => <BulkSendModal {...props} channelId={channel.id} />)}
    >
        <BulkSendIcon />
    </ChatBarButton>
);

export default definePlugin({
    name: "BulkSend",
    description: "Adds a chat bar button to queue several messages (one per line) and send them all at once, in order.",
    authors: [EquicordDevs.eqen],
    settings,
    chatBarButton: {
        icon: BulkSendIcon,
        render: BulkSendButton
    }
});
