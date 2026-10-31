/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { execFile as cpExecFile } from "child_process";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";

import { Updater } from ".";

const VENCORD_SRC_DIR = join(__dirname, "..");
const EQUICORD_DIR = join(__dirname, "../../");

const execFile = promisify(cpExecFile);

const isFlatpak = process.platform === "linux" && !!process.env.FLATPAK_ID;

// Discord opened from the Finder only gets /usr/bin:/bin. Vault's macOS installer puts Node in ~/.vault/node, Homebrew
// uses /opt/homebrew (Apple Silicon) or /usr/local (Intel).
if (process.platform === "darwin") process.env.PATH = [join(homedir(), ".vault", "node", "bin"), "/opt/homebrew/bin", "/usr/local/bin", process.env.PATH].join(":");

function git(...args: string[]) {
    const opts = { cwd: VENCORD_SRC_DIR };

    if (isFlatpak) return execFile("flatpak-spawn", ["--host", "git", ...args], opts);
    else return execFile("git", args, opts);
}

async function getRepo() {
    const res = await git("remote", "get-url", "origin");
    return res.stdout.trim()
        .replace(/git@(.+):/, "https://$1/")
        .replace(/\.git$/, "");
}

async function calculateGitChanges() {
    await git("fetch");

    const branch = (await git("branch", "--show-current")).stdout.trim();

    const existsOnOrigin = (await git("ls-remote", "origin", branch)).stdout.length > 0;
    if (!existsOnOrigin) return [];

    const res = await git("log", `HEAD...origin/${branch}`, "--pretty=format:%an/%h/%s");

    const commits = res.stdout.trim();
    return commits ? commits.split("\n").map(line => {
        const [author, hash, ...rest] = line.split("/");
        return {
            hash, author,
            message: rest.join("/").split("\n")[0]
        };
    }) : [];
}

// HEAD avant le dernier pull : sert à revenir en arrière si l'installation des dépendances ou la compilation échoue.
let previousHead: string | null = null;

async function rollback() {
    if (!previousHead) return;
    try { await git("reset", "--hard", previousHead); } catch { /* best effort */ }
    previousHead = null;
}

// Si une mise à jour change les dépendances, il faut les installer avant de compiler, sinon le build échoue.
async function installDependenciesIfNeeded(from: string) {
    const changed = (await git("diff", "--name-only", from, "HEAD", "--", "package.json", "pnpm-lock.yaml")).stdout.trim();
    if (!changed) return;

    const opts = { cwd: EQUICORD_DIR, shell: process.platform === "win32" };
    const args = ["install", "--frozen-lockfile", "--prefer-offline"];
    try {
        if (isFlatpak) await execFile("flatpak-spawn", ["--host", "pnpm", ...args], opts);
        else await execFile("pnpm", args, opts);
    } catch {
        // pnpm n'est pas dans le PATH de Discord : corepack est livré avec Node (jusqu'à Node 24), sinon npx.
        try {
            await execFile("corepack", ["pnpm", ...args], opts);
        } catch {
            const pnpmVersion = (await readFile(join(EQUICORD_DIR, "package.json"), "utf-8")).match(/"packageManager":\s*"pnpm@([^"]+)"/)?.[1] ?? "latest";
            await execFile("npx", ["--yes", `pnpm@${pnpmVersion}`, ...args], opts);
        }
    }
}

async function pull() {
    const before = (await git("rev-parse", "HEAD")).stdout.trim();
    const res = await git("pull");
    const updated = res.stdout.includes("Fast-forward");
    if (!updated) return false;

    previousHead = before;
    try {
        await installDependenciesIfNeeded(before);
    } catch (err) {
        await rollback();
        throw err;
    }
    return true;
}

async function build() {
    const opts = { cwd: EQUICORD_DIR };

    const command = isFlatpak ? "flatpak-spawn" : "node";
    const args = isFlatpak ? ["--host", "node", "scripts/build/build.mjs"] : ["scripts/build/build.mjs"];

    if (IS_DEV) args.push("--dev");

    let ok = false;
    try {
        const res = await execFile(command, args, opts);
        ok = !res.stderr.includes("Build failed");
    } catch {
        ok = false;
    }

    if (ok) previousHead = null;
    else await rollback(); // on garde la version qui marche plutôt que du code non compilé

    return ok;
}

const GitUpdater: Updater = {
    getRepo,
    listUpdates: calculateGitChanges,
    fetchUpdate: pull,
    applyUpdate: build
};

export default GitUpdater;
