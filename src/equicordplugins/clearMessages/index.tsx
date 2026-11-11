/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { ClearMessagesIcon } from "@components/VaultIcons";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, Message, User } from "@vencord/discord-types";
import { ChannelStore, Menu, RestAPI, showToast, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    delayMs: {
        type: OptionType.NUMBER,
        description: "Delay between each deleted message, in milliseconds (0 = as fast as Discord allows).",
        default: 350
    }
});

interface UserContextProps {
    channel?: Channel;
    guildId?: string;
    user?: User;
}

// channels currently being cleared (used to toggle start/stop)
const clearing = new Set<string>();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// only normal messages (DEFAULT = 0, REPLY = 19) can be deleted by their author
const DELETABLE_TYPES = [0, 19];

function toast(text: string, variant: "success" | "critical" = "success") {
    showToast({ text, variant });
}

// fromMessageId: if set, only delete messages from that message onwards (the
// targeted message itself + everything newer than it).
async function clearMessages(channelId: string, fromMessageId?: string) {
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return toast("Could not tell who you are yet. Try again in a moment.", "critical");

    clearing.add(channelId);
    toast(fromMessageId
        ? "Clearing from this message... (open the user menu to stop)"
        : "Clearing your messages... (open the menu again to stop)");

    let before: string | undefined;
    let deleted = 0;
    let failed = 0;
    let failedInARow = 0;
    let lastError = "";
    let looked = 0; // messages read
    let mine = 0; // of which yours

    try {
        // paginate from newest to oldest using snowflake "before" cursor
        while (clearing.has(channelId)) {
            const query: Record<string, any> = { limit: 100 };
            if (before) query.before = before;

            let body: any[];
            try {
                const res = await RestAPI.get({ url: `/channels/${channelId}/messages`, query } as any);
                body = res.body;
            } catch (err: any) {
                const why = err?.body?.message ?? err?.message ?? String(err);
                console.error("[ClearMessages] could not read the channel", err);
                toast(`Could not read this channel (${why}). Stopping.`, "critical");
                break;
            }

            if (!Array.isArray(body) || body.length === 0) break;
            looked += body.length;

            // body is newest-first, which is exactly the order we want to delete in
            let reachedEnd = false;
            for (const msg of body) {
                if (!clearing.has(channelId)) { reachedEnd = true; break; }
                before = msg.id; // advance cursor to ever-older messages

                // stop once we go older than the target message (bounded mode)
                if (fromMessageId && BigInt(msg.id) < BigInt(fromMessageId)) { reachedEnd = true; break; }

                if (msg.author?.id !== myId) continue;
                mine++;
                if (!DELETABLE_TYPES.includes(msg.type)) continue;

                try {
                    // the same route Discord itself calls; RestAPI also waits out rate limits
                    await RestAPI.del({ url: `/channels/${channelId}/messages/${msg.id}` });
                    deleted++;
                    failedInARow = 0;
                } catch (err: any) {
                    // already gone: nothing to do
                    if (err?.status === 404) continue;
                    failed++;
                    failedInARow++;
                    lastError = err?.body?.message ?? err?.message ?? String(err);
                    // a refusal that repeats (no permission, session problem) would only hammer Discord: stop and say why
                    if (failedInARow >= 5) {
                        toast(`Discord keeps refusing to delete (${lastError}). Stopping.`, "critical");
                        clearing.delete(channelId);
                        reachedEnd = true;
                        break;
                    }
                }
                await sleep(Math.max(0, settings.store.delayMs || 0));
            }

            if (reachedEnd) break;
            if (body.length < 100) break; // reached the oldest message
        }
    } finally {
        clearing.delete(channelId);
        showNotification({
            title: "Clear Messages",
            body: `Done — deleted ${deleted} message${deleted === 1 ? "" : "s"}${failed ? `, ${failed} failed (${lastError})` : ""}. Looked at ${looked}, ${mine} ${mine === 1 ? "was" : "were"} yours.`
        });
    }
}

const patchUserContext: NavContextMenuPatchCallback = (children, { user, channel }: UserContextProps) => {
    if (!user) return;

    // prefer the DM channel with this user; fall back to the menu's channel
    const dmId = (ChannelStore as any).getDMFromUserId?.(user.id);
    const channelId: string | undefined = dmId ?? channel?.id;
    if (!channelId) return;

    const isClearing = clearing.has(channelId);

    children.push(
        <Menu.MenuItem
            id="vault-clear-messages"
            label={isClearing ? "Stop Clearing" : "Clear Messages"}
            color="danger"
            icon={() => <ClearMessagesIcon size={18} />}
            action={() => {
                if (clearing.has(channelId)) {
                    clearing.delete(channelId);
                    toast("Stopped clearing.");
                } else {
                    clearMessages(channelId);
                }
            }}
        />
    );
};

const patchMessageContext: NavContextMenuPatchCallback = (children, { message }: { message?: Message; }) => {
    if (!message) return;
    const channelId = message.channel_id;

    children.push(
        <Menu.MenuItem
            id="vault-clear-from-here"
            label="Clear from this Message"
            color="danger"
            icon={() => <ClearMessagesIcon size={18} />}
            action={() => {
                if (clearing.has(channelId)) {
                    toast("Already clearing this channel — open the user menu to stop.", "critical");
                    return;
                }
                clearMessages(channelId, message.id);
            }}
        />
    );
};

export default definePlugin({
    name: "ClearMessages",
    description: "Deletes your own messages one by one (newest to oldest). 'Clear Messages' on a user clears a whole DM; 'Clear from this Message' on a message clears that message and everything after it. Re-open the user menu to stop.",
    authors: [EquicordDevs.eqen],
    enabledByDefault: true,
    tags: ["Utility", "Chat"],
    settings,
    contextMenus: {
        "user-context": patchUserContext,
        "message": patchMessageContext
    },

    // for checking from the console
    clearMessages
});
