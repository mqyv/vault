/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgePosition, BadgeRarity, ProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import { EquicordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { VAULT_OWNER_ID } from "@utils/vaultOwner";
import { UserStore } from "@webpack/common";

import { BADGE_ART, VaultBadgeKey } from "./art";

// Vault's badge service (Supabase project "vault"). The publishable key is meant to ship in clients: it can only call
// the three functions below, the tables themselves are not readable with it.
const API = "https://zjppxtnfohjvsjfqioqh.supabase.co/rest/v1/rpc";
const KEY = "sb_publishable_um7nFUOFF1T2qbzVsfQaow_SzIjrW9k";
const HEADERS = { apikey: KEY, "Content-Type": "application/json" };

const CACHE_MS = 30 * 60_000;
const RETRY_MS = 60_000;
const BATCH = 100;

type Role = Exclude<VaultBadgeKey, "owner" | "member">;
interface BadgeInfo { member: boolean; roles: string[]; expires: number; }

const logger = new Logger("VaultBadges");
const cache = new Map<string, BadgeInfo>();
const queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const settings = definePluginSettings({
    showMembership: {
        type: OptionType.BOOLEAN,
        description: "Show the Member badge to other Vault users (sends only your Discord user id to the Vault badge service).",
        default: true,
        onChange: (on: boolean) => on ? register() : unregister()
    }
});

function rpc(fn: string, body: unknown) {
    return fetch(`${API}/${fn}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
}

async function flush() {
    flushTimer = null;
    const ids = [...queued].slice(0, BATCH);
    ids.forEach(id => queued.delete(id));
    if (queued.size) flushTimer = setTimeout(flush, 50);
    if (!ids.length) return;

    try {
        const res = await rpc("vault_badges", { ids });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows: { user_id: string; member: boolean; roles: string[]; }[] = await res.json();
        const expires = Date.now() + CACHE_MS;
        for (const id of ids) {
            const row = rows.find(r => r.user_id === id);
            cache.set(id, { member: !!row?.member, roles: row?.roles ?? [], expires });
        }
    } catch (err) {
        logger.warn("Could not load badges", err);
        const expires = Date.now() + RETRY_MS;
        for (const id of ids) if (!cache.has(id)) cache.set(id, { member: false, roles: [], expires });
    }
}

/** Badge info for a user; unknown or stale users are fetched in the background (batched). */
function info(userId: string): BadgeInfo | undefined {
    const hit = cache.get(userId);
    if (!hit || hit.expires < Date.now()) {
        queued.add(userId);
        flushTimer ??= setTimeout(flush, 120);
    }
    return hit;
}

async function register() {
    const id = UserStore.getCurrentUser()?.id;
    if (!id || !settings.store.showMembership) return;
    try {
        await rpc("vault_register", { uid: id });
        cache.delete(id);
    } catch (err) {
        logger.warn("Could not register as a Vault member", err);
    }
}

async function unregister() {
    const id = UserStore.getCurrentUser()?.id;
    if (!id) return;
    try {
        await rpc("vault_unregister", { uid: id });
        cache.delete(id);
    } catch (err) {
        logger.warn("Could not remove the Vault member badge", err);
    }
}

function badge(key: VaultBadgeKey, shouldShow: (userId: string) => boolean): ProfileBadge {
    const art = BADGE_ART[key];
    return {
        id: `vault_${key}_badge`,
        description: art.label,
        infoLabel: "Vault",
        rarity: key === "owner" ? BadgeRarity.MYTHIC : key === "member" ? BadgeRarity.COMMON : BadgeRarity.EPIC,
        iconSrc: art.uri,
        largeIconSrc: art.uri,
        position: BadgePosition.START,
        shouldShow: ({ userId }) => shouldShow(userId)
    };
}

const hasRole = (role: Role) => (userId: string) => !!info(userId)?.roles.includes(role);

export default definePlugin({
    name: "VaultBadges",
    description: "Vault's own profile badges, visible to Vault users: Owner, Staff, Donor, Bug Hunter, Helper and Member.",
    authors: [EquicordDevs.eqen],
    tags: ["Appearance", "Friends"],
    enabledByDefault: true,
    settings,

    userProfileBadges: [
        badge("owner", userId => userId === VAULT_OWNER_ID),
        badge("staff", hasRole("staff")),
        badge("donor", hasRole("donor")),
        badge("bug_hunter", hasRole("bug_hunter")),
        badge("helper", hasRole("helper")),
        // Member only when no other Vault badge already says the same thing
        badge("member", userId => userId !== VAULT_OWNER_ID && !!info(userId)?.member && !info(userId)?.roles.length)
    ],

    flux: {
        // Start loading a user's badges as soon as Discord starts fetching their profile, so they are ready on render.
        USER_PROFILE_FETCH_START({ userId }: { userId: string; }) {
            info(userId);
        },
        CONNECTION_OPEN() {
            register();
        }
    },

    start() {
        register();
    }
});
