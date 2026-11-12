/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType } from "@api/Commands";
import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { saveFile } from "@utils/web";
import { GuildStore, RelationshipStore, RestAPI, showToast, SnowflakeUtils, UserStore } from "@webpack/common";

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

/** Friend id -> last message id, for every DM Discord lists. The client keeps only a few in memory, so this asks the API. */
async function lastMessageIds(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    try {
        const res = await RestAPI.get({ url: "/users/@me/channels" });
        for (const ch of res.body ?? []) {
            const other = ch.recipient_ids?.[0] ?? ch.recipients?.[0]?.id;
            if (ch.type === 1 && ch.last_message_id && other) result[other] = ch.last_message_id;
        }
    } catch (err) {
        console.error("[AccountBackup] could not read your DMs", err);
    }
    return result;
}

const nameOf = (id: string) => {
    const u: any = UserStore.getUser(id);
    return { username: u?.username ?? null, globalName: u?.globalName ?? null };
};

/**
 * Saves your friends, blocked accounts and servers to a JSON file in your downloads, so you can still see afterwards who was
 * removed or which server you left. Returns the file name. `reason` becomes part of the file name.
 */
export async function saveBackup(reason = "backup"): Promise<string> {
    const me: any = UserStore.getCurrentUser();
    const last = await lastMessageIds();
    const guilds: any[] = Object.values(GuildStore.getGuilds());

    const data = {
        exportedAt: new Date().toISOString(),
        reason,
        account: { id: me?.id ?? null, username: me?.username ?? null },
        friends: RelationshipStore.getFriendIDs().map(id => ({
            id,
            ...nameOf(id),
            lastMessageAt: last[id] ? new Date(SnowflakeUtils.extractTimestamp(last[id])).toISOString() : null
        })),
        blocked: RelationshipStore.getBlockedIDs().map(id => ({ id, ...nameOf(id) })),
        servers: guilds.map(g => ({ id: g.id, name: g.name, owner: g.ownerId === me?.id }))
    };

    const fileName = `vault-${reason}-${stamp()}.json`;
    saveFile(new File([JSON.stringify(data, null, 2)], fileName, { type: "application/json" }));
    return fileName;
}

export default definePlugin({
    name: "AccountBackup",
    description: "Enregistre tes amis, tes comptes bloqués et tes serveurs dans un fichier JSON (/backup account). Le nettoyage d'amis s'en sert aussi avant de retirer quelqu'un.",
    authors: [EquicordDevs.eqen],
    enabledByDefault: true,
    tags: ["Utility", "Friends"],
    dependencies: ["CommandsAPI"],

    commands: [
        {
            name: "backup account",
            description: "Enregistre tes amis, tes comptes bloqués et tes serveurs dans un fichier.",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async () => {
                try {
                    const file = await saveBackup();
                    showToast({ text: `Backup saved: ${file}`, variant: "success" });
                } catch (err: any) {
                    showToast({ text: `Backup failed: ${err?.message ?? err}`, variant: "critical" });
                }
            }
        }
    ]
});
