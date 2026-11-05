/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { execFileSync, spawn } from "child_process";
import { createHash } from "crypto";
import { ipcMain } from "electron";
import { existsSync, readFileSync } from "fs";
import { hostname, userInfo } from "os";
import { join } from "path";

import { serializeErrors } from "./updater/common";

// Vault's folder: dist/ (where this file is bundled) sits directly inside it
const VAULT_DIR = join(__dirname, "..");

/**
 * Starts Vault's uninstaller in its own process and returns, because it closes Discord (this very process) to take Vault
 * out of it, then reopens Discord. Installed with the setup wizard, Windows' own uninstaller does the whole job (restores
 * Discord, deletes Vault's folder, removes the Start menu shortcut). A manual install has none: only the injection is removed.
 *
 * `forced` is for when the licence ended: the uninstaller runs without asking anything, so Discord comes back without Vault.
 */
function uninstallVault(_: unknown, forced = false) {
    if (process.platform !== "win32") throw new Error("Uninstalling from Vault is only available on Windows");

    const uninstaller = join(VAULT_DIR, "unins000.exe");
    if (existsSync(uninstaller)) {
        spawn(uninstaller, forced ? ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"] : [], { detached: true, stdio: "ignore" }).unref();
        return "uninstaller";
    }

    const script = join(VAULT_DIR, "scripts", "install-vault.ps1");
    if (!existsSync(script)) throw new Error("Vault's uninstall script was not found");
    spawn("powershell.exe", [
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", script, "-Stage", "uninject", "-InstallDir", VAULT_DIR, "-Yes"
    ], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return "script";
}

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
function getDeviceId() {
    const id = readMachineId() ?? `${hostname()}|${userInfo().username}`;
    return createHash("sha256").update(`vault-device:${id}`).digest("hex");
}

ipcMain.handle(IpcEvents.UNINSTALL_VAULT, serializeErrors(uninstallVault));
ipcMain.handle(IpcEvents.VAULT_DEVICE_ID, serializeErrors(getDeviceId));
