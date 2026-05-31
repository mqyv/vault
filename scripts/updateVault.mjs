/*
 * Vault update script.
 *
 * Pulls the latest Equicord fixes (which keep Vault working through Discord
 * updates) and replays the Vault branding commits on top via rebase, then
 * rebuilds.
 *
 * Usage:  pnpm update-vault
 *
 * After a Discord update you may also need to re-inject:  pnpm inject
 * (Discord must be fully closed for inject to work.)
 */

import { execFileSync } from "child_process";

const UPSTREAM = "upstream";
const BRANCH = "main";

function git(...args) {
    return execFileSync("git", args, { stdio: "pipe", encoding: "utf-8" }).trim();
}

function gitInherit(...args) {
    execFileSync("git", args, { stdio: "inherit" });
}

function run(cmd, args) {
    execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
}

function log(msg) {
    console.log(`\x1b[36m[vault]\x1b[0m ${msg}`);
}

function fail(msg) {
    console.error(`\x1b[31m[vault] ${msg}\x1b[0m`);
    process.exit(1);
}

// 1. Refuse to run on a dirty tree (would lose uncommitted work in a rebase).
const status = git("status", "--porcelain");
if (status) {
    fail(
        "Working tree has uncommitted changes. Commit or stash them first:\n" +
        status
    );
}

// 2. Make sure the upstream remote exists and points at Equicord.
let remotes = "";
try {
    remotes = git("remote");
} catch { /* no remotes */ }

if (!remotes.split("\n").includes(UPSTREAM)) {
    log(`Adding '${UPSTREAM}' remote -> Equicord (source of Discord-compat fixes)`);
    git("remote", "add", UPSTREAM, "https://github.com/Equicord/Equicord.git");
}

// 3. Fetch the latest upstream fixes.
log("Fetching latest Equicord fixes...");
gitInherit("fetch", UPSTREAM, BRANCH);

const before = git("rev-parse", "HEAD");

// 4. Replay Vault branding commits on top of the latest upstream.
log(`Rebasing Vault changes onto ${UPSTREAM}/${BRANCH}...`);
try {
    gitInherit("rebase", `${UPSTREAM}/${BRANCH}`);
} catch {
    log("Rebase hit a conflict — rolling back so nothing is broken.");
    try { gitInherit("rebase", "--abort"); } catch { /* ignore */ }
    fail(
        "Conflict between an Equicord update and the Vault branding.\n" +
        "This only happens when Equicord edited the same lines we rebranded.\n" +
        "Resolve manually:  git fetch upstream && git rebase upstream/main\n" +
        "then re-run the branding edits on the conflicting files."
    );
}

const after = git("rev-parse", "HEAD");
if (before === after) {
    log("Already up to date. Nothing to rebuild.");
    process.exit(0);
}

// 5. Dependencies may have changed upstream — sync them.
log("Syncing dependencies...");
run("pnpm", ["install"]);

// 6. Rebuild.
log("Rebuilding Vault...");
run("pnpm", ["build"]);

log("Done. Vault is updated.");
log("If Discord was also updated, run:  pnpm inject  (with Discord closed)");
