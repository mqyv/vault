#!/usr/bin/env node
/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Publishes a Vault build to the private release gate (Supabase function "vault-release").
//
//   pnpm release                 build, zip, upload and make it the current version
//   pnpm release --no-build      use the dist/ that already exists
//   pnpm release --dry           build the zip into dist-release/ and publish nothing
//   pnpm release --notes "text"  short note stored next to the version
//   pnpm release --installer     also compile VaultSetup.exe and publish it to the public bucket (the bot links to it)
//   pnpm release --installer-only  only that: no build, no new version
//
// The zip holds only what a user needs: the compiled files, without source maps (they contain the original source) and
// without the repository. Needs the owner key: VAULT_OWNER_KEY, or the one saved in Vault's own settings.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE = process.env.VAULT_RELEASE_URL ?? "https://zjppxtnfohjvsjfqioqh.supabase.co/functions/v1/vault-release";

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const notes = args.includes("--notes") ? args[args.indexOf("--notes") + 1] ?? "" : "";

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

function ownerKey() {
    if (process.env.VAULT_OWNER_KEY) return process.env.VAULT_OWNER_KEY.trim();
    const candidates = [
        process.env.APPDATA && join(process.env.APPDATA, "Vault", "settings", "settings.json"),
        process.env.HOME && join(process.env.HOME, "Library", "Application Support", "Vault", "settings", "settings.json")
    ].filter(Boolean);
    for (const file of candidates) {
        if (!existsSync(file)) continue;
        const key = JSON.parse(readFileSync(file, "utf8")).vaultBadges?.ownerKey?.trim();
        if (key) return key;
    }
    throw new Error("Owner key not found: set VAULT_OWNER_KEY, or save it in Vault's settings (Badges Vault).");
}

async function gate(body) {
    const res = await fetch(GATE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(`Gate refused "${body.action}": ${data.reason ?? res.status}`);
    return data;
}

// the comment pointing to the map would only produce a 404 for the files we do not ship
const stripMapComment = text => text.replace(/\n?\/[*/]# sourceMappingURL=.*?(\*\/)?\s*$/s, "\n");

function collect(version) {
    const files = {};
    const text = (name, content) => (files[name] = new TextEncoder().encode(content));

    const desktop = join(ROOT, "dist", "desktop");
    for (const name of ["patcher.js", "preload.js", "renderer.js", "renderer.css"]) {
        const file = join(desktop, name);
        if (!existsSync(file)) throw new Error(`Missing ${file}: run the build first.`);
        text(`dist/desktop/${name}`, stripMapComment(readFileSync(file, "utf8")));
    }
    for (const name of ["package.json", "patcher.js.LEGAL.txt", "renderer.js.LEGAL.txt"]) {
        const file = join(desktop, name);
        if (existsSync(file)) files[`dist/desktop/${name}`] = readFileSync(file);
    }
    for (const name of ["scripts/install-vault.ps1", "scripts/install-vault.sh", "LICENSE"]) {
        files[name] = readFileSync(join(ROOT, name));
    }
    text("version.json", JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2) + "\n");
    return files;
}

// The installer holds no secret (the licence key protects Vault), so it sits in a public bucket with a stable link.
async function publishInstaller(key) {
    const iscc = [
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs", "Inno Setup 6", "ISCC.exe"),
        join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Inno Setup 6", "ISCC.exe")
    ].find(p => p && existsSync(p));
    if (!iscc) throw new Error("Inno Setup not found (winget install JRSoftware.InnoSetup).");

    console.log("Compiling the installer…");
    execFileSync(iscc, ["installer\\vault.iss"], { cwd: ROOT, stdio: "ignore" });
    const exe = readFileSync(join(ROOT, "installer", "Output", "VaultSetup.exe"));

    await uploadPublic(key, "VaultSetup.exe", exe);
    // the macOS installer is a plain script, run with `curl … | bash`
    await uploadPublic(key, "install-vault.sh", readFileSync(join(ROOT, "scripts", "install-vault.sh")));
}

async function uploadPublic(key, file, bytes) {
    const { url, public_url } = await gate({ action: "publish_installer_url", owner_key: key, file });
    const form = new FormData();
    form.append("cacheControl", "300");
    form.append("", new Blob([bytes], { type: "application/octet-stream" }));
    const up = await fetch(url, { method: "PUT", headers: { "x-upsert": "true" }, body: form });
    if (!up.ok) throw new Error(`Upload of ${file} failed: ${up.status} ${(await up.text()).slice(0, 200)}`);
    console.log(`${file} published (${(bytes.length / 1e6).toFixed(1)} MB): ${public_url}`);
}

async function main() {
    if (flag("--installer-only")) return publishInstaller(ownerKey());

    if (!flag("--no-build")) {
        console.log("Building Vault…");
        execFileSync("node", ["scripts/build/build.mjs"], { cwd: ROOT, stdio: "inherit" });
    }

    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const dirty = git("status", "--porcelain", "--untracked-files=no", "--", "src", "scripts", "package.json").length > 0;
    const version = `${pkg.version}-${git("rev-parse", "--short=7", "HEAD")}${dirty ? "-dev" : ""}`;
    if (dirty) console.warn("Warning: uncommitted changes in src/ or scripts/, the version is marked -dev.");

    const zip = Buffer.from(zipSync(collect(version), { level: 9 }));
    const sha256 = createHash("sha256").update(zip).digest("hex");
    console.log(`Version ${version}: ${(zip.length / 1e6).toFixed(1)} MB, sha256 ${sha256.slice(0, 12)}…`);

    if (flag("--dry")) {
        const out = join(ROOT, "dist-release");
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${version}.zip`), zip);
        console.log(`Dry run: written to dist-release/${version}.zip, nothing published.`);
        return;
    }

    const key = ownerKey();
    const { url } = await gate({ action: "publish_url", owner_key: key, version });

    // same request shape as supabase-js uploadToSignedUrl
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([zip], { type: "application/zip" }));
    const up = await fetch(url, { method: "PUT", headers: { "x-upsert": "true" }, body: form });
    if (!up.ok) throw new Error(`Upload failed: ${up.status} ${(await up.text()).slice(0, 200)}`);

    await gate({ action: "publish_done", owner_key: key, version, sha256, size: zip.length, notes });
    console.log(`Published ${version}. It is now the version every licensed install receives.`);

    if (flag("--installer")) await publishInstaller(key);
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
