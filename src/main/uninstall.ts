/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { spawn } from "child_process";
import { ipcMain } from "electron";
import { existsSync } from "fs";
import { join } from "path";

import { VAULT_DIR } from "./licence";
import { serializeErrors } from "./updater/common";

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

ipcMain.handle(IpcEvents.UNINSTALL_VAULT, serializeErrors(uninstallVault));
