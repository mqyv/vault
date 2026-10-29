/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Helpers used by .github/workflows/sync-upstream.yml after merging Equicord into Vault.
//
//   node scripts/vaultSync.mjs rebrand <sha-before-merge>   rebrand the lines Equicord added/changed
//   node scripts/vaultSync.mjs fixpkg                       keep Vault's package.json identity
//   node scripts/vaultSync.mjs check                        fail if a Vault customisation got lost
//
// Everything is idempotent: running it twice changes nothing.

import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf-8", maxBuffer: 1 << 28 });

// "Equicord" -> "Vault" only where it is user-visible text: never in identifiers, property access,
// URLs, domains or other projects' names. Credits stay accurate: contributor badges and plugin-origin labels keep "Equicord".
const SKIP_LINE = /^\s*(import\b|export\s*\{)|github\.com|equicord\.org|cdn\.|Equilotl|Equibop|Equicloud|Equibored|Equibuilds|\/\/\s*@|require\(|Contributor|infoLabel|Equicord Plugin/;
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
    ["src/equicordplugins/vaultBadges/index.ts", "vault_badges", "Vault badges plugin"],
    ["src/components/VaultIcons.tsx", "BulkSendIcon", "Vault plugin icons"]
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
else { console.error("usage: vaultSync.mjs rebrand <sha> | fixpkg | check"); process.exit(2); }
