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
import type { Channel, Guild, Message, User } from "@vencord/discord-types";
import { Alerts, ChannelStore, Menu, RestAPI, showToast, UserStore } from "@webpack/common";

const settings = definePluginSettings({
    delayMs: {
        type: OptionType.NUMBER,
        description: "Pause entre chaque message supprimé, en millisecondes (0 = aussi vite que Discord le permet).",
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

/**
 * Deletes every message you sent in a whole server. Discord's own search finds them (author = you) across all channels and
 * threads you can see, so we do not have to walk each channel. Results are read page by page while deleting.
 */
async function clearGuild(guildId: string, guildName: string) {
    const myId = UserStore.getCurrentUser()?.id;
    if (!myId) return toast("Could not tell who you are yet. Try again in a moment.", "critical");

    const key = `guild:${guildId}`;
    clearing.add(key);
    toast(`Clearing your messages in ${guildName}... (open the server menu again to stop)`);

    const seen = new Set<string>();
    let offset = 0;
    let deleted = 0;
    let failed = 0;
    let failedInARow = 0;
    let lastError = "";

    try {
        while (clearing.has(key)) {
            let res: any;
            try {
                res = await RestAPI.get({
                    url: `/guilds/${guildId}/messages/search`,
                    query: { author_id: myId, include_nsfw: true, sort_by: "timestamp", sort_order: "desc", offset }
                } as any);
            } catch (err: any) {
                const why = err?.body?.message ?? err?.message ?? String(err);
                console.error("[ClearMessages] search failed", err);
                toast(`Could not search this server (${why}). Stopping.`, "critical");
                break;
            }

            // 202: Discord is still indexing this server, ask again shortly
            if (res.status === 202) {
                await sleep(Math.max(1, Number(res.body?.retry_after) || 2) * 1000);
                continue;
            }

            const hits: any[] = (res.body?.messages ?? []).flat().filter((m: any) => m.hit && m.author?.id === myId);
            const total: number = res.body?.total_results ?? 0;
            if (hits.length === 0) break;

            let fresh = 0;
            let kept = 0; // results that stay in the search (not deletable, or refused): the next page must skip them
            for (const msg of hits) {
                if (!clearing.has(key)) break;
                if (seen.has(msg.id)) continue; // deleted already, the search index has not caught up yet
                seen.add(msg.id);
                fresh++;

                if (!DELETABLE_TYPES.includes(msg.type)) { kept++; continue; }
                try {
                    await RestAPI.del({ url: `/channels/${msg.channel_id}/messages/${msg.id}` });
                    deleted++;
                    failedInARow = 0;
                } catch (err: any) {
                    if (err?.status === 404) continue; // already gone
                    failed++;
                    kept++;
                    failedInARow++;
                    lastError = err?.body?.message ?? err?.message ?? String(err);
                    if (failedInARow >= 5) {
                        toast(`Discord keeps refusing to delete (${lastError}). Stopping.`, "critical");
                        clearing.delete(key);
                        break;
                    }
                }
                await sleep(Math.max(0, settings.store.delayMs || 0));
            }

            // only stale results came back: step past them instead of reading them forever
            offset += fresh === 0 ? hits.length : kept;
            if (offset >= total) break;
            await sleep(1000); // the search route has its own, stricter rate limit
        }
    } finally {
        clearing.delete(key);
        showNotification({
            title: "Clear Messages",
            body: `Done in ${guildName} — deleted ${deleted} message${deleted === 1 ? "" : "s"}${failed ? `, ${failed} failed (${lastError})` : ""}.`
        });
    }
}

const patchGuildContext: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;
    const key = `guild:${guild.id}`;
    const isClearing = clearing.has(key);

    children.push(
        <Menu.MenuItem
            id="vault-clear-server"
            label={isClearing ? "Stop Clearing Server" : "Clear My Messages in this Server"}
            color="danger"
            icon={() => <ClearMessagesIcon size={18} />}
            action={() => {
                if (clearing.has(key)) {
                    clearing.delete(key);
                    toast("Stopped clearing.");
                    return;
                }
                Alerts.show({
                    title: `Clear your messages in ${guild.name}?`,
                    body: "This deletes every message you sent in this server, in all the channels and threads you can see. It cannot be undone and can take a long time.",
                    confirmColor: "danger",
                    confirmText: "Clear",
                    cancelText: "Cancel",
                    onConfirm: () => void clearGuild(guild.id, guild.name)
                });
            }}
        />
    );
};

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
    description: "Supprime tes propres messages un par un, du plus récent au plus ancien. « Clear Messages » sur un utilisateur vide tout le MP ; « Clear from this Message » sur un message supprime celui-ci et tout ce qui suit ; « Clear My Messages in this Server » sur un serveur le vide partout. Rouvre le même menu pour arrêter.",
    authors: [EquicordDevs.eqen],
    enabledByDefault: true,
    tags: ["Utility", "Chat"],
    settings,
    contextMenus: {
        "user-context": patchUserContext,
        "message": patchMessageContext,
        "guild-context": patchGuildContext
    },

    // for checking from the console
    clearMessages,
    clearGuild
});
