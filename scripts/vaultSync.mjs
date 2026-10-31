/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Helpers used by .github/workflows/sync-upstream.yml after merging Equicord into Vault.
//
//   node scripts/vaultSync.mjs rebrand <sha-before-merge>   rebrand the lines Equicord added/changed
//   node scripts/vaultSync.mjs fixpkg                       keep Vault's package.json identity
//   node scripts/vaultSync.mjs dates                        record when each plugin was added upstream (for "New")
//   node scripts/vaultSync.mjs check                        fail if a Vault customisation got lost
//
// Everything is idempotent: running it twice changes nothing.

import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf-8", maxBuffer: 1 << 28 });

// "Equicord" -> "Vault" only where it is user-visible text: never in identifiers, property access,
// URLs, domains or other projects' names. Credits stay accurate: contributor badges and plugin-origin labels keep "Equicord".
const SKIP_LINE = /^\s*(import\b|export\s*\{)|github\.com|equicord\.org|cdn\.|Equilotl|Equibop|Equicloud|Equibored|Equibuilds|\/\/\s*@|require\(|Contributor|infoLabel|Equicord Plugin|Show Equicord/;
const EQUICORD = /(?<![\w/@.\-$])Equicord(?![\w.\-/]|\.\w)/g;
const FILES = /^src\/.*\.(tsx?|html|css)$/;

function rebrand(before) {
    const changed = git("diff", "--name-only", "--diff-filter=AM", before, "--", "src").split("\n").filter(f => FILES.test(f));
    let total = 0;
    for (const file of changed) {
        if (!existsSync(file)) continue;
        // line numbers (in the working tree) of lines that differ from our pre-merge version
        const touched = new Set();
        for (const m of git("diff", "-U0", "--no-color", before, "--", file).matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
            const start = +m[1], len = m[2] === undefined ? 1 : +m[2];
            for (let i = 0; i < len; i++) touched.add(start + i);
        }
        const lines = readFileSync(file, "utf-8").split("\n");
        let edited = false;
        for (const n of touched) {
            const line = lines[n - 1];
            if (line === undefined || SKIP_LINE.test(line) || !line.includes("Equicord")) continue;
            const next = line.replace(EQUICORD, "Vault");
            if (next !== line) { lines[n - 1] = next; edited = true; total++; }
        }
        if (edited) writeFileSync(file, lines.join("\n"));
    }
    console.log(`rebrand: ${total} line(s) in ${changed.length} changed file(s)`);
}

function fixPackage() {
    const raw = readFileSync("package.json", "utf-8");
    const pkg = JSON.parse(raw);
    pkg.name = "vault";
    pkg.description = "Vault - a personal Discord client mod built on Equicord";
    // keep upstream's 4-space indent and its trailing-newline state so the file never shows noise in diffs
    writeFileSync("package.json", JSON.stringify(pkg, null, 4) + (raw.endsWith("\n") ? "\n" : ""));
    for (const script of ["update-vault"]) {
        if (!pkg.scripts?.[script]) throw new Error(`package.json lost the "${script}" script`);
    }
    console.log("package.json identity ok");
}

// When each plugin landed in Vencord / Equicord (committer date of the commit that added it), so the plugin list can
// flag what is new upstream as new in Vault too. Written to src/utils/pluginDates.json; installs are shallow clones
// without history, so the file is generated here (full history) and committed.
// Keyed by the folder's base name (lowercase, without .desktop/.web… suffix or extension), so a plugin that was only
// renamed or moved between src/plugins and src/equicordplugins keeps its original date. Must match pluginBaseName()
// in src/utils/pluginSource.ts.
const PLUGIN_DIRS = ["src/plugins", "src/equicordplugins"];
const baseName = folder => folder.split("/").pop().split(".")[0].toLowerCase();
function pluginDates() {
    // --no-renames: a move shows as an add at its new path and the old path's add is still seen, so the min is right
    const out = git("log", "--full-history", "--no-renames", "--diff-filter=A", "--name-only", "--format=@%ct", "--", ...PLUGIN_DIRS);
    const dates = {};
    let time = 0;
    for (const line of out.split("\n")) {
        if (line.startsWith("@")) { time = +line.slice(1); continue; }
        const m = line.match(/^src\/(?:plugins|equicordplugins)\/[^/]+/);
        if (!m) continue;
        const key = baseName(m[0]);
        dates[key] = Math.min(dates[key] ?? Infinity, time);
    }
    // only plugins that exist today
    const live = PLUGIN_DIRS.flatMap(d => readdirSync(d).map(f => baseName(`${d}/${f}`))).filter(k => k in dates);
    const sorted = Object.fromEntries([...new Set(live)].sort().map(k => [k, dates[k]]));
    writeFileSync("src/utils/pluginDates.json", JSON.stringify(sorted, null, 1) + "\n");
    console.log(`dates: ${Object.keys(sorted).length} plugins`);
}

// [file, text that must still be present, why]
const MUST_CONTAIN = [
    ["package.json", "\"name\": \"vault\"", "package identity"],
    ["src/main/patcher.ts", "\"Vault\")", "data directory name"],
    ["src/shared/vencordUserAgent.ts", "Vault/", "user agent"],
    ["src/utils/vaultLogo.ts", "VAULT_LOGO_URI", "embedded logo"],
    ["src/components/settings/tabs/plugins/PluginCard.tsx", "VAULT_LOGO_URI", "plugin badge logo"],
    ["src/components/settings/tabs/sync/CloudTab.tsx", "VAULT_LOGO_URI", "cloud tab logo"],
    ["src/main/updater/git.ts", "installDependenciesIfNeeded", "safe updater (deps + rollback)"],
    ["src/main/updater/git.ts", "rollback", "safe updater (deps + rollback)"],
    ["src/main/about.html", "data:image/svg+xml", "about window logo"],
    ["src/utils/constants.ts", "eqen", "owner dev entry used by Vault plugins"],
    ["src/equicordplugins/bulkSend/index.tsx", "BulkSend", "Vault plugin"],
    ["src/equicordplugins/vaultPerformance/index.tsx", "VaultPerformance", "Vault plugin"],
    ["installer/vault.iss", "VaultSetup", "installer"],
    ["scripts/install-vault.ps1", "vault-install.log", "installer script"],
    [".github/workflows/sync-upstream.yml", "vaultSync.mjs", "sync workflow"],
    ["src/api/PluginManager.ts", "getImplicitApiDependencies", "API plugins enabled with the plugin at runtime"],
    ["src/utils/vaultBadges.tsx", "vault_badges", "built-in Vault badges"],
    ["src/Vencord.ts", "initVaultBadges", "Vault badges started with Vault"],
    ["src/components/settings/tabs/vencord/index.tsx", "VaultBadgesSection", "Vault badges settings"],
    ["src/components/VaultIcons.tsx", "BulkSendIcon", "Vault plugin icons"],
    ["src/main/csp/index.ts", "zjppxtnfohjvsjfqioqh.supabase.co", "badge service allowed by the CSP"],
    ["src/utils/pluginSource.ts", "isVaultOwnPlugin", "Vault / Equicord / Vencord plugin credits"],
    ["src/components/settings/tabs/plugins/index.tsx", "SearchStatus.VAULT", "Show Vault filter (owner plugins only)"],
    ["src/components/settings/tabs/plugins/index.tsx", "isRecentlyAdded", "New filter follows upstream additions"],
    ["src/components/settings/tabs/plugins/PluginCard.tsx", "getPluginSource", "plugin source badge"],
    ["src/utils/pluginDates.json", "bulksend", "plugin add dates"],
    ["src/api/Badges.ts", "refreshBadges", "profiles re-render when a badge changes"],
    ["src/plugins/_api/badges/index.tsx", "useBadgeRefresh", "profiles re-render when a badge changes"],
    ["src/utils/vaultBadges.tsx", "refreshBadges()", "badge toggles show at once"],
    ["scripts/install-vault.sh", "discord_targets", "macOS installer"],
    ["src/main/updater/git.ts", ".vault\", \"node\"", "macOS updater finds Node installed by the macOS installer"]
];

function check() {
    const problems = [];
    for (const [file, needle, why] of MUST_CONTAIN) {
        if (!existsSync(file)) { problems.push(`${file} is missing (${why})`); continue; }
        if (!readFileSync(file, "utf-8").includes(needle)) problems.push(`${file} no longer contains ${JSON.stringify(needle)} (${why})`);
    }
    if (problems.length) {
        console.error("Vault customisations lost in the merge:\n - " + problems.join("\n - "));
        process.exit(1);
    }
    console.log(`check: ${MUST_CONTAIN.length} Vault customisations intact`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "rebrand" && arg) rebrand(arg);
else if (cmd === "fixpkg") fixPackage();
else if (cmd === "check") check();
else if (cmd === "dates") pluginDates();
else { console.error("usage: vaultSync.mjs rebrand <sha> | fixpkg | dates | check"); process.exit(2); }
