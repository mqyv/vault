/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Builds site/plugins.json (the full plugin catalogue shown on the website) from the real plugin sources.
//   pnpm generateSitePlugins

import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname, "..");
const out = execFileSync("pnpm", ["exec", "tsx", "scripts/generatePluginList.ts"], {
    cwd: root, encoding: "utf-8", shell: process.platform === "win32", maxBuffer: 1 << 28
});
const plugins = JSON.parse(out.slice(out.indexOf("[{")));

const VAULT_AUTHOR = "eqen";
const source = p => p.authors.some(a => a.name === VAULT_AUTHOR) ? "vault"
    : p.filePath.startsWith("src/equicordplugins") ? "equicord" : "vencord";

const rank = { vault: 0, equicord: 1, vencord: 2 };
const list = plugins
    .filter(p => !p.required) // core plugins are always on and not user-facing
    .map(p => ({ n: p.name, d: p.description.trim(), t: p.tags ?? [], s: source(p), ...(p.enabledByDefault ? { e: 1 } : {}) }))
    .sort((a, b) => rank[a.s] - rank[b.s] || a.n.localeCompare(b.n, "en", { sensitivity: "base" }));

writeFileSync(join(root, "site", "plugins.json"), JSON.stringify(list));
console.log(`site/plugins.json: ${list.length} plugins (${["vault", "equicord", "vencord"].map(s => `${s} ${list.filter(p => p.s === s).length}`).join(", ")})`);
