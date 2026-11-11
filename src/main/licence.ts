/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { ipcMain } from "electron";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { hostname, userInfo } from "os";
import { join } from "path";

import { serializeErrors } from "./updater/common";

// This file is bundled in <Vault>/dist/desktop, so Vault's folder is two levels up (same as the git updater)
export const VAULT_DIR = join(__dirname, "..", "..");

const LICENCE_FILE = join(VAULT_DIR, "licence.json");

// Vault's private release gate (Supabase function). It only answers to a valid licence key on its own device.
export const GATE_URL = "https://zjppxtnfohjvsjfqioqh.supabase.co/functions/v1/vault-release";

export interface StoredLicence { key: string; verified: boolean; }

function readMachineId(): string | null {
    try {
        if (process.platform === "win32") {
            const out = execFileSync("reg.exe", ["query", String.raw`HKLM\SOFTWARE\Microsoft\Cryptography`, "/v", "MachineGuid"], { encoding: "utf8", windowsHide: true });
            return /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null;
        }
        if (process.platform === "darwin") {
            const out = execFileSync("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { encoding: "utf8" });
            return /"IOPlatformUUID" = "([^"]+)"/.exec(out)?.[1] ?? null;
        }
        return readFileSync("/etc/machine-id", "utf8").trim() || null;
    } catch {
        return null;
    }
}

/** The licence key is tied to this value: a hash of the computer's id, never the id itself. */
export function getDeviceId() {
    const id = readMachineId() ?? `${hostname()}|${userInfo().username}`;
    return createHash("sha256").update(`vault-device:${id}`).digest("hex");
}

export function readLicence(): StoredLicence | null {
    try {
        const data = JSON.parse(readFileSync(LICENCE_FILE, "utf8"));
        return typeof data?.key === "string" && data.key ? { key: data.key, verified: !!data.verified } : null;
    } catch {
        return null;
    }
}

export const hasLicenceFile = () => existsSync(LICENCE_FILE);

function writeLicence(licence: StoredLicence) {
    writeFileSync(LICENCE_FILE, JSON.stringify(licence) + "\n", "utf8");
}

/** One call to the release gate. Never throws on a refusal: the answer says why. */
export async function callGate<T = any>(body: Record<string, unknown>): Promise<T & { ok: boolean; reason?: string; }> {
    const res = await fetch(GATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    return await res.json();
}

ipcMain.handle(IpcEvents.VAULT_DEVICE_ID, serializeErrors(getDeviceId));
ipcMain.handle(IpcEvents.VAULT_LICENCE_GET, serializeErrors(() => readLicence()));
ipcMain.handle(IpcEvents.VAULT_LICENCE_SET, serializeErrors((_: unknown, licence: StoredLicence) => {
    if (typeof licence?.key !== "string" || !licence.key.trim()) throw new Error("No key");
    writeLicence({ key: licence.key.trim(), verified: !!licence.verified });
}));
ipcMain.handle(IpcEvents.VAULT_LICENCE_CLEAR, serializeErrors(() => rmSync(LICENCE_FILE, { force: true })));
