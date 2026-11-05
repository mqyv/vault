/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { del as dsDel, get as dsGet, set as dsSet } from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Logger } from "@utils/Logger";
import { SettingsRouter, UserStore } from "@webpack/common";

import { VAULT_OWNER_ID } from "./vaultOwner";

// Vault's licence service (Supabase project "vault"). Same publishable key as the badges: it can only call this function,
// which answers about one key and never lists anything.
const API = "https://zjppxtnfohjvsjfqioqh.supabase.co/rest/v1/rpc";
const KEY = "sb_publishable_um7nFUOFF1T2qbzVsfQaow_SzIjrW9k";

const STORE_KEY = "Vault_licenceKey";
const STORE_VERIFIED = "Vault_licenceVerified";
const CHECK_EVERY_MS = 5 * 60_000;
const FIRST_CHECK_MS = 8_000;
// time to read the message before Discord closes
const REMOVE_DELAY_MS = 10_000;

// A key that was accepted on this computer and is now refused for one of these reasons means the access is over.
// Anything else (no network, service down, odd answer) never removes Vault.
const ENDED = new Set(["revoked", "expired", "unknown", "other_device"]);

const REASONS: Record<string, string> = {
    unknown: "Cette clé n'existe pas.",
    revoked: "Cette clé a été retirée.",
    expired: "Cet accès est terminé.",
    other_device: "Cette clé est déjà liée à un autre appareil.",
    not_claimed: "Cette clé n'a pas encore été activée : fais /claim sur le serveur d'abord.",
    no_device: "Cet appareil n'a pas pu être identifié."
};

const logger = new Logger("VaultLicence");
let removing = false;
let started = false;
let remindedNoKey = false;

export type LicenceState =
    | { status: "owner"; }
    | { status: "none"; }
    | { status: "ok"; until: string | null; }
    | { status: "offline"; }
    | { status: "refused"; reason: string; }
    | { status: "ended"; reason: string; };

async function ask(key: string) {
    const device = await VencordNative.updater.getDeviceId();
    if (!device.ok) throw new Error("device");

    const res = await fetch(`${API}/vault_licence_check`, {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ licence_key: key, device: device.value })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as { ok: boolean; reason?: string; access_until?: string | null; };
}

export async function getSavedKey(): Promise<string | null> {
    return (await dsGet<string>(STORE_KEY)) ?? null;
}

export function isOwnerAccount() {
    return UserStore.getCurrentUser?.()?.id === VAULT_OWNER_ID;
}

/** Checks a key typed in by the person; it is only kept when the service accepts it for this computer. */
export async function saveKey(raw: string): Promise<{ ok: true; until: string | null; } | { ok: false; message: string; }> {
    const key = raw.trim();
    if (!key) return { ok: false, message: "Colle ta clé." };
    try {
        const res = await ask(key);
        if (!res.ok) return { ok: false, message: REASONS[res.reason ?? ""] ?? "Cette clé n'est pas valide." };
        await dsSet(STORE_KEY, key);
        await dsSet(STORE_VERIFIED, true);
        remindedNoKey = false;
        return { ok: true, until: res.access_until ?? null };
    } catch (err) {
        logger.warn("Key check failed", err);
        return { ok: false, message: "Le service de clés ne répond pas. Réessaie dans un instant." };
    }
}

export async function forgetKey() {
    await dsDel(STORE_KEY);
    await dsDel(STORE_VERIFIED);
}

function endAccess(reason: string) {
    if (removing) return;
    removing = true;

    showNotification({
        title: "Ton accès à Vault est terminé",
        body: "Vault va se désinstaller et Discord va redémarrer sans lui.",
        color: "var(--red-360)",
        noPersist: true
    });

    setTimeout(async () => {
        try {
            const res = await VencordNative.updater.uninstall(true);
            if (!res.ok) throw new Error(res.error?.message ?? "uninstall failed");
        } catch (err) {
            removing = false;
            logger.error("Could not remove Vault after the access ended", reason, err);
        }
    }, REMOVE_DELAY_MS);
}

export async function checkLicence(): Promise<LicenceState> {
    const user = UserStore.getCurrentUser?.();
    if (!user) return { status: "offline" };
    if (user.id === VAULT_OWNER_ID) return { status: "owner" };

    const key = await getSavedKey();
    if (!key) {
        if (!remindedNoKey) {
            remindedNoKey = true;
            showNotification({
                title: "Vault est privé",
                body: "Ajoute ta clé d'accès dans Réglages → Vault pour activer ton compte.",
                onClick: () => SettingsRouter.openUserSettings("equicord_main_panel")
            });
        }
        return { status: "none" };
    }

    try {
        const res = await ask(key);
        if (res.ok) return { status: "ok", until: res.access_until ?? null };

        const reason = res.reason ?? "";
        if (ENDED.has(reason) && await dsGet(STORE_VERIFIED)) {
            endAccess(reason);
            return { status: "ended", reason };
        }
        return { status: "refused", reason };
    } catch (err) {
        logger.warn("Licence check failed, will retry", err);
        return { status: "offline" };
    }
}

export function startVaultLicence() {
    if (started) return;
    started = true;
    setTimeout(function tick() {
        checkLicence().finally(() => setTimeout(tick, CHECK_EVERY_MS));
    }, FIRST_CHECK_MS);
}
