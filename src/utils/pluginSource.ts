/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Who made a plugin, and whether it is new. Vault's own plugins are the ones written by the owner; everything else keeps
// its origin: Equicord (src/equicordplugins) or Vencord (src/plugins).

import type { Plugin } from "@utils/types";
import { VAULT_OWNER_ID } from "@utils/vaultOwner";

import { PluginMeta } from "~plugins";

import pluginDates from "./pluginDates.json";

export type PluginSource = "vault" | "equicord" | "vencord" | "user";

/** How long a plugin added upstream counts as new. */
export const NEW_PLUGIN_DAYS = 30;

export const isVaultOwnPlugin = (plugin: Plugin) => (plugin.authors ?? []).some(a => String(a.id) === VAULT_OWNER_ID);

export function getPluginSource(plugin: Plugin): PluginSource | null {
    const meta = PluginMeta[plugin.name];
    if (meta?.userPlugin) return "user";
    if (isVaultOwnPlugin(plugin)) return "vault";
    if (meta?.folderName.startsWith("src/equicordplugins/")) return "equicord";
    if (meta?.folderName.startsWith("src/plugins/")) return "vencord";
    return null;
}

/** Same key as scripts/vaultSync.mjs: folder base name, lowercase, without .desktop/.web… suffix. */
const pluginBaseName = (folderName: string) => folderName.split("/").pop()!.split(".")[0].toLowerCase();

/** When the plugin was first added to Vencord, Equicord or Vault (unix seconds), if known. */
export function getPluginAddedAt(plugin: Plugin): number | undefined {
    const meta = PluginMeta[plugin.name];
    return meta ? (pluginDates as Record<string, number>)[pluginBaseName(meta.folderName)] : undefined;
}

/** Added upstream (or by the owner) in the last NEW_PLUGIN_DAYS days. */
export function isRecentlyAdded(plugin: Plugin, now = Date.now() / 1000) {
    const added = getPluginAddedAt(plugin);
    return added != null && now - added < NEW_PLUGIN_DAYS * 86400;
}
