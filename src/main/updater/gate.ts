/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Updater of a private Vault install: no Git and no public repository. The new build comes from the release gate, which only
// answers to a valid licence key on this computer. The zip is checked against the published SHA-256 before anything is written.

import { createHash } from "crypto";
import { unzipSync } from "fflate";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve, sep } from "path";

import { callGate, getDeviceId, readLicence, VAULT_DIR } from "../licence";
import { UpdateData,Updater } from ".";

// what a build may contain; anything else in the zip is ignored
const ALLOWED = /^(dist\/desktop\/[\w.-]+|scripts\/install-vault\.(ps1|sh)|LICENSE|version\.json)$/;

interface Pending { version: string; files: Record<string, Uint8Array>; }
let pending: Pending | null = null;

function installedVersion() {
    try {
        return JSON.parse(readFileSync(join(VAULT_DIR, "version.json"), "utf8")).version as string;
    } catch {
        return "";
    }
}

function credentials() {
    const licence = readLicence();
    return licence ? { licence_key: licence.key, device: getDeviceId() } : null;
}

async function listUpdates(): Promise<UpdateData[]> {
    const auth = credentials();
    if (!auth) return [];

    const latest = await callGate<{ version: string; notes?: string; }>({ action: "latest", ...auth });
    // a refused key is the licence check's business (it removes Vault); here there is simply nothing to install
    if (!latest.ok || latest.version === installedVersion()) return [];

    return [{ hash: latest.version, author: "Vault", message: latest.notes || "New version of Vault" }];
}

async function fetchUpdate() {
    const auth = credentials();
    if (!auth) return false;

    const info = await callGate<{ url: string; version: string; sha256: string; }>({ action: "download", ...auth });
    if (!info.ok) throw new Error(`The update was refused (${info.reason}).`);
    if (info.version === installedVersion()) return false;

    const res = await fetch(info.url);
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    const zip = new Uint8Array(await res.arrayBuffer());

    if (createHash("sha256").update(zip).digest("hex") !== info.sha256) throw new Error("The downloaded update is corrupted.");

    const files: Record<string, Uint8Array> = {};
    for (const [name, data] of Object.entries(unzipSync(zip))) {
        if (ALLOWED.test(name)) files[name] = data;
    }
    if (!files["dist/desktop/patcher.js"] || !files["version.json"]) throw new Error("The downloaded update is incomplete.");

    pending = { version: info.version, files };
    return true;
}

// Windows may keep a file busy for a moment (antivirus, indexing): try again a few times
async function replace(from: string, to: string) {
    for (let i = 0; ; i++) {
        try {
            return renameSync(from, to);
        } catch (err) {
            if (i >= 10) throw err;
            await new Promise(r => setTimeout(r, 300));
        }
    }
}

async function applyUpdate() {
    if (!pending) return false;

    const root = resolve(VAULT_DIR) + sep;
    // version.json goes last: while it is missing or old, the update is simply tried again
    const names = Object.keys(pending.files).sort((a, b) => Number(a === "version.json") - Number(b === "version.json"));
    const written: string[] = [];

    try {
        for (const name of names) {
            const dest = resolve(VAULT_DIR, name);
            if (!dest.startsWith(root)) throw new Error(`Unsafe path in the update: ${name}`);
            mkdirSync(dirname(dest), { recursive: true });
            writeFileSync(dest + ".new", pending.files[name]);
            written.push(dest);
        }
        for (const dest of written) await replace(dest + ".new", dest);
    } catch (err) {
        for (const dest of written) if (existsSync(dest + ".new")) rmSync(dest + ".new", { force: true });
        throw err;
    }

    pending = null;
    return true;
}

export default {
    getRepo: async () => "https://vaultcord.fr",
    listUpdates,
    fetchUpdate,
    applyUpdate
} satisfies Updater;
