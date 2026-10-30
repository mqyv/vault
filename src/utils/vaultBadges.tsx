/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Vault's own profile badges, built into Vault (not a plugin). Badge types (name, image) live on Vault's badge service
// so owners can change them from Vault without an update. Owners grant badges from a user's context menu; the Member
// badge comes with installing Vault (it can be turned off in Vault's settings).

import { addProfileBadge, BadgePosition, BadgeRarity, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { addContextMenuPatch, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Settings } from "@api/Settings";
import { copyWithToast } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { Alerts, FluxDispatcher, Menu, React, showToast, UserStore } from "@webpack/common";

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
let ownerId: string | null = null;
let ownerCheckedKey: string | null = null; // key the last successful check was made with
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

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
        notify();
    } catch (err) {
        // keep the previous answer; the check is retried on the next connection or context menu
        logger.warn("Could not check the owner key", err);
    }
    return ownerId;
}

export const isOwner = () => ownerId != null;

/** Applies the change locally right away (menu and profile update instantly), then confirms it with the server. */
async function setRole(userId: string, username: string, type: BadgeType, enabled: boolean) {
    const entry = cache.get(userId) ?? { member: false, roles: [], expires: Date.now() + CACHE_MS };
    const before = entry.roles;
    entry.roles = enabled ? [...new Set([...before, type.key])] : before.filter(r => r !== type.key);
    cache.set(userId, entry);
    notify();

    try {
        const newKey = await rpc<string | null>("vault_owner_set_role", { owner_key: settings().ownerKey, uid: userId, role: type.key, enabled });
        if (newKey) {
            Alerts.show({
                title: `Clé owner de ${username}`,
                body: `Donne cette clé à ${username} (en privé) : elle ne sera plus jamais affichée. Il la colle dans Réglages Vault, section Badges Vault.\n\n${newKey}`,
                confirmText: "Copier la clé",
                cancelText: "Fermer",
                onConfirm: () => copyWithToast(newKey, "Clé copiée")
            });
        }
    } catch (err: any) {
        entry.roles = before; // undo the local change
        notify();
        showToast({ text: `${type.label} non modifié pour ${username} : ${err?.message ?? err}`, variant: "critical" });
    }
}

export async function setBadge(key: string, label: string | null, iconUrl: string | null) {
    await rpc("vault_owner_set_badge", { owner_key: settings().ownerKey, badge: key, new_label: label, new_icon_url: iconUrl });
    await loadBadgeTypes();
}

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: { id: string; username: string; }; }) => {
    const [, rerender] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
        listeners.add(rerender);
        return () => void listeners.delete(rerender);
    }, []);

    // the key was never checked successfully (offline at startup, key just pasted...): check now, the menu shows next time
    const key = settings().ownerKey?.trim();
    if (key && key !== ownerCheckedKey) void checkOwnerKey();
    if (!types.length) void loadBadgeTypes();
    if (!user || !isOwner() || !types.length) return;
    const current = info(user.id);
    children.push(
        <Menu.MenuItem id="vault-badges" label="Badges Vault">
            {types.filter(t => t.key !== "member").map(t => {
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
 * Frames any picture like Discord's own badges: the visible part (non-transparent pixels) is scaled so its longest
 * side fills 88% of a square and centred, then exported as a 96px PNG. Every Vault badge thus has the exact same
 * size and position next to Discord's badges, whatever the source image.
 */
export async function frameBadgeImage(file: Blob): Promise<string> {
    const SIZE = 96, FILL = 0.88;
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
    const scale = (SIZE * FILL) / Math.max(w, h);
    const out = document.createElement("canvas");
    out.width = out.height = SIZE;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, x0, y0, w, h, (SIZE - w * scale) / 2, (SIZE - h * scale) / 2, w * scale, h * scale);
    return out.toDataURL("image/png");
}

// --- startup ----------------------------------------------------------------------------------

export function initVaultBadges() {
    loadBadgeTypes();
    checkOwnerKey();
    addContextMenuPatch("user-context", userContextPatch);
    // Start loading a user's badges as soon as Discord starts fetching their profile, so they are ready on render.
    FluxDispatcher.subscribe("USER_PROFILE_FETCH_START", ({ userId }: { userId: string; }) => void info(userId));
    FluxDispatcher.subscribe("CONNECTION_OPEN", () => {
        syncMembership();
        checkOwnerKey();
        if (!types.length) loadBadgeTypes();
    });
    syncMembership();
}
