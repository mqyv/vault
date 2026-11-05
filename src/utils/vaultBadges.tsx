/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Vault's own profile badges, built into Vault (not a plugin). Badge types (name, image) live on Vault's badge service
// so owners can change them from Vault without an update. Owners grant badges from a user's context menu; the Member
// badge comes with installing Vault (it can be turned off in Vault's settings).

import { addProfileBadge, BadgePosition, BadgeRarity, ProfileBadge, refreshBadges, removeProfileBadge } from "@api/Badges";
import { addContextMenuPatch, NavContextMenuPatchCallback } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { FluxDispatcher, Menu, React, showToast, UserStore } from "@webpack/common";

// Vault's badge service (Supabase project "vault"). The publishable key is meant to ship in clients: it can only call the
// functions below; tables are not readable with it and every owner action is checked against the owner's secret key.
const API = "https://zjppxtnfohjvsjfqioqh.supabase.co/rest/v1/rpc";
const KEY = "sb_publishable_um7nFUOFF1T2qbzVsfQaow_SzIjrW9k";

const CACHE_MS = 30 * 60_000;
const RETRY_MS = 60_000;
const BATCH = 100;

export interface BadgeType { key: string; label: string; icon_url: string | null; sort: number; }
interface BadgeInfo { member: boolean; roles: string[]; expires: number; }

const logger = new Logger("VaultBadges");
const cache = new Map<string, BadgeInfo>();
const queued = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let registered: ProfileBadge[] = [];
let types: BadgeType[] = [];
let typesLoadedAt = 0; // the list is read again when the menu opens, so an order change shows up without restarting Discord
const TYPES_REFRESH_MS = 30_000;
let ownerId: string | null = null;
let ownerCheckedKey: string | null = null; // key the last successful check was made with
const listeners = new Set<() => void>();
// open menus and open profiles both follow badge changes right away
const notify = () => {
    listeners.forEach(l => l());
    refreshBadges();
};

const settings = () => Settings.vaultBadges;

async function rpc<T = unknown>(fn: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}/${fn}`, {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
    return data as T;
}

// --- reading badges ---------------------------------------------------------------------------

async function flush() {
    flushTimer = null;
    const ids = [...queued].slice(0, BATCH);
    ids.forEach(id => queued.delete(id));
    if (queued.size) flushTimer = setTimeout(flush, 50);
    if (!ids.length) return;

    try {
        const rows = await rpc<{ user_id: string; member: boolean; roles: string[]; }[]>("vault_badges", { ids });
        const expires = Date.now() + CACHE_MS;
        for (const id of ids) {
            const row = rows.find(r => r.user_id === id);
            cache.set(id, { member: !!row?.member, roles: row?.roles ?? [], expires });
        }
        notify();
    } catch (err) {
        logger.warn("Could not load badges", err);
        const expires = Date.now() + RETRY_MS;
        for (const id of ids) if (!cache.has(id)) cache.set(id, { member: false, roles: [], expires });
    }
}

function info(userId: string): BadgeInfo | undefined {
    const hit = cache.get(userId);
    if (!hit || hit.expires < Date.now()) {
        queued.add(userId);
        flushTimer ??= setTimeout(flush, 120);
    }
    return hit;
}

function refresh(userId: string) {
    cache.delete(userId);
    info(userId);
}

function shows(type: BadgeType, userId: string) {
    const i = info(userId);
    if (!i) return false;
    // Member only when no other Vault badge is shown
    if (type.key === "member") return i.member && !i.roles.length;
    return i.roles.includes(type.key);
}

export async function loadBadgeTypes() {
    try {
        types = await rpc<BadgeType[]>("vault_badge_types", {});
        typesLoadedAt = Date.now();
    } catch (err) {
        logger.warn("Could not load badge types", err);
        return;
    }
    registered.forEach(removeProfileBadge);
    registered = types
        .filter(t => t.icon_url) // a badge without an image is not shown
        .map(t => ({
            id: `vault_${t.key}_badge`,
            description: t.label,
            infoLabel: "Vault",
            rarity: t.key === "owner" ? BadgeRarity.MYTHIC : t.key === "member" ? BadgeRarity.COMMON : BadgeRarity.EPIC,
            iconSrc: t.icon_url!,
            largeIconSrc: t.icon_url!,
            position: BadgePosition.START,
            shouldShow: ({ userId }) => shows(t, userId)
        }));
    // Discord shows START badges in reverse insertion order: add the last ones first so the sort order is kept
    [...registered].reverse().forEach(addProfileBadge);
    notify();
}

export const getBadgeTypes = () => types;

// --- membership -------------------------------------------------------------------------------

export async function syncMembership() {
    const id = UserStore.getCurrentUser()?.id;
    if (!id) return;
    try {
        await rpc(settings().showMembership ? "vault_register" : "vault_unregister", { uid: id });
        refresh(id);
    } catch (err) {
        logger.warn("Could not update the Member badge", err);
    }
}

// --- owners -----------------------------------------------------------------------------------

/** Discord id of the owner the saved key belongs to, or null. */
export async function checkOwnerKey(): Promise<string | null> {
    const key = settings().ownerKey?.trim();
    if (!key) {
        ownerId = ownerCheckedKey = null;
        return null;
    }
    try {
        ownerId = await rpc<string | null>("vault_owner_whoami", { owner_key: key });
        ownerCheckedKey = key;
        diagnose({ ownerChecked: ownerId != null });
        notify();
    } catch (err) {
        // keep the previous answer; the check is retried on the next connection or context menu
        logger.warn("Could not check the owner key", err);
        diagnose({ ownerCheckError: String(err) });
    }
    return ownerId;
}

export const isOwner = () => ownerId != null;

// Per user+badge: the state the owner asked for last, and whether a request is already running. Requests for the same
// badge of the same user are sent one at a time and the last choice wins, so fast check/uncheck never ends out of sync.
const wanted = new Map<string, boolean>();
const sending = new Set<string>();

function setLocal(userId: string, role: string, enabled: boolean) {
    const entry = cache.get(userId) ?? { member: false, roles: [], expires: Date.now() + CACHE_MS };
    entry.roles = enabled ? [...new Set([...entry.roles, role])] : entry.roles.filter(r => r !== role);
    cache.set(userId, entry);
    notify();
}

/** Applies the change locally right away (menu and profile update instantly), then confirms it with the server. */
async function setRole(userId: string, username: string, type: BadgeType, enabled: boolean) {
    const id = `${userId}:${type.key}`;
    const confirmed = !enabled; // what the server has before this click
    wanted.set(id, enabled);
    setLocal(userId, type.key, enabled);
    if (sending.has(id)) return; // the running request will send the latest choice when it ends

    sending.add(id);
    let serverState = confirmed;
    try {
        while (wanted.get(id) !== serverState) {
            const target = wanted.get(id)!;
            await rpc("vault_owner_set_role", { owner_key: settings().ownerKey, uid: userId, role: type.key, enabled: target });
            serverState = target;
        }
    } catch (err: any) {
        wanted.set(id, serverState);
        setLocal(userId, type.key, serverState); // show what the server really has
        showToast({ text: `${type.label} non modifié pour ${username} : ${err?.message ?? err}`, variant: "critical" });
    } finally {
        sending.delete(id);
    }
}

export async function setBadge(key: string, label: string | null, iconUrl: string | null) {
    await rpc("vault_owner_set_badge", { owner_key: settings().ownerKey, badge: key, new_label: label, new_icon_url: iconUrl });
    await loadBadgeTypes();
}

/** Used by the menu until the real list has loaded. */
const FALLBACK_TYPES: BadgeType[] = [
    { key: "staff", label: "Vault Staff", icon_url: null, sort: 1 },
    { key: "helper", label: "Vault Helper", icon_url: null, sort: 2 },
    { key: "bug_hunter", label: "Vault Bug Hunter", icon_url: null, sort: 3 },
    { key: "donor", label: "Vault Donateur", icon_url: null, sort: 4 }
];

const userContextPatch: NavContextMenuPatchCallback =(children, { user }: { user?: { id: string; username: string; }; }) => {
    // Only refreshes the ticks while the menu is open. Hooks can throw here (the menu's own hook order changes between
    // renders) and the context menu API swallows that, which would silently drop the whole item: never let it.
    try {
        const [, rerender] = React.useReducer((n: number) => n + 1, 0);
        React.useEffect(() => {
            listeners.add(rerender);
            return () => void listeners.delete(rerender);
        }, []);
    } catch (err) {
        diagnose({ hookError: String(err) });
    }

    // The menu only needs a saved key, not a network check: at boot the network may not be up yet. The server still
    // verifies the key on every change and refuses a wrong one, so this gives nobody any extra power.
    const key = settings().ownerKey?.trim();
    if (key && key !== ownerCheckedKey) void checkOwnerKey();
    if (!types.length || Date.now() - typesLoadedAt > TYPES_REFRESH_MS) void loadBadgeTypes();
    diagnose({ menuOpened: true, keySaved: !!key, typesLoaded: types.length });
    if (!user || !key) return;
    const menuTypes = types.length ? types : FALLBACK_TYPES;
    const current = info(user.id);
    children.push(
        <Menu.MenuItem id="vault-badges" label="Badges Vault">
            {/* the owner badge is yours alone and Member comes with installing Vault: neither can be given */}
            {menuTypes.filter(t => t.key !== "member" && t.key !== "owner").map(t => {
                const has = !!current?.roles.includes(t.key);
                return (
                    <Menu.MenuCheckboxItem
                        key={t.key}
                        id={`vault-badge-${t.key}`}
                        label={t.label}
                        checked={has}
                        action={() => setRole(user.id, user.username, t, !has)}
                    />
                );
            })}
        </Menu.MenuItem>
    );
};

// --- image framing ----------------------------------------------------------------------------

/**
 * Frames any picture like Discord's own badges: the visible part (non-transparent pixels) is scaled to the area of a
 * 74% square (so wide, tall and square shapes look the same size), never past 92% on either side, centred, then
 * exported as a 96px PNG. Measured on Discord's own badge icons: the visible part covers 64% to 81% of the image
 * (74% on average, 92% at the widest) and is centred. Every Vault badge thus has the same size and position next to them.
 */
export async function frameBadgeImage(file: Blob): Promise<string> {
    const SIZE = 96, FILL = 0.74, MAX = 0.92;
    const bitmap = await createImageBitmap(file);
    const src = document.createElement("canvas");
    src.width = bitmap.width;
    src.height = bitmap.height;
    const sctx = src.getContext("2d")!;
    sctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = sctx.getImageData(0, 0, src.width, src.height);

    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            if (data[(y * width + x) * 4 + 3] > 24) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
    if (x1 < 0) throw new Error("image vide (entièrement transparente)");

    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const scale = Math.min((SIZE * FILL) / Math.sqrt(w * h), (SIZE * MAX) / Math.max(w, h));
    const out = document.createElement("canvas");
    out.width = out.height = SIZE;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, x0, y0, w, h, (SIZE - w * scale) / 2, (SIZE - h * scale) / 2, w * scale, h * scale);
    return out.toDataURL("image/png");
}

// --- startup ----------------------------------------------------------------------------------

/** Keeps trying until the badge list and the owner key are loaded: right after boot the network often isn't up yet. */
function retryUntilLoaded(delay = 5000) {
    setTimeout(async () => {
        if (!types.length) await loadBadgeTypes();
        const key = settings().ownerKey?.trim();
        if (key && key !== ownerCheckedKey) await checkOwnerKey();
        const done = types.length && (!settings().ownerKey?.trim() || settings().ownerKey?.trim() === ownerCheckedKey);
        if (!done) retryUntilLoaded(Math.min(delay * 2, 60_000));
    }, delay);
}

// --- start-up journal --------------------------------------------------------------------------

// What happened on each of the last launches, kept across restarts: start-up problems can't be observed live, as
// they only happen when the PC boots. Read it with Vencord.Api.DataStore.get("vault-badges-boots").
const BOOTS_KEY = "vault-badges-boots";
const bootEntry: Record<string, unknown> = { at: new Date().toISOString(), hidden: document.hidden };
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function diagnose(facts: Record<string, unknown>) {
    Object.assign(bootEntry, facts);
    saveTimer ??= setTimeout(async () => {
        saveTimer = null;
        try {
            const boots = (await DataStore.get<Record<string, unknown>[]>(BOOTS_KEY)) ?? [];
            const others = boots.filter(b => b.at !== bootEntry.at);
            await DataStore.set(BOOTS_KEY, [...others, bootEntry].slice(-10));
        } catch { /* only a journal */ }
    }, 1000);
}

export function initVaultBadges() {
    // the menu first: it needs nothing else, so nothing below can prevent it
    addContextMenuPatch(["user-context", "user-profile-actions", "user-profile-overflow-menu"], userContextPatch);
    diagnose({ menuRegistered: true, keySaved: !!settings()?.ownerKey?.trim() });

    loadBadgeTypes();
    checkOwnerKey();
    retryUntilLoaded();
    // Start loading a user's badges as soon as Discord starts fetching their profile, so they are ready on render.
    FluxDispatcher.subscribe("USER_PROFILE_FETCH_START", ({ userId }: { userId: string; }) => void info(userId));
    FluxDispatcher.subscribe("CONNECTION_OPEN", () => {
        syncMembership();
        checkOwnerKey();
        if (!types.length) loadBadgeTypes();
    });
    syncMembership();
}
