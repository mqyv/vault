/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { EquicordDevs } from "@utils/constants";
import { fetchUserProfile } from "@utils/discord";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Alerts, Menu, RestAPI, showToast, UserProfileStore } from "@webpack/common";

interface UserContextProps {
    user?: User;
}

function VaultIcon(props: any) {
    return (
        <svg width={18} height={18} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="11" strokeLinejoin="miter" {...props}>
            <path d="M14 22 L50 82 L86 22" />
            <path d="M30 22 L50 56 L70 22" />
        </svg>
    );
}

function cdn(kind: "avatars" | "banners", id: string, hash: string) {
    const ext = hash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/${kind}/${id}/${hash}.${ext}?size=2048`;
}

async function toDataUri(url: string): Promise<string> {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
    });
}

async function patch(url: string, body: Record<string, any>): Promise<boolean> {
    if (!body || !Object.keys(body).length) return false;
    try {
        await RestAPI.patch({ url, body } as any);
        return true;
    } catch (e) {
        console.error("[CopyProfile]", url, e);
        return false;
    }
}

async function cloneProfile(user: User) {
    try {
        await fetchUserProfile(user.id);
        const profile: any = UserProfileStore.getUserProfile(user.id) ?? {};
        const u: any = user;

        // --- avatar / banner image (account-level) ---
        const me: Record<string, any> = {};
        try {
            if (user.avatar) me.avatar = await toDataUri(cdn("avatars", user.id, user.avatar));
            if (profile.banner) me.banner = await toDataUri(cdn("banners", user.id, profile.banner));
        } catch { /* image fetch failed (e.g. banner needs Nitro) */ }
        await patch("/users/@me", me);

        // --- bio / pronouns / banner color (profile-level) ---
        const prof: Record<string, any> = {};
        if (profile.bio) prof.bio = profile.bio;
        if (profile.pronouns) prof.pronouns = profile.pronouns;
        // accent color = the solid colour shown as the banner when there's no banner image
        const accent = profile.accentColor ?? u.accentColor ?? profile.bannerColor;
        if (accent != null) prof.accent_color = accent;
        await patch("/users/@me/profile", prof);

        // --- profile theme colours (gradient) — attempted whether or not you have Nitro ---
        const themeColors = profile.themeColors ?? profile.theme_colors;
        const themeApplied = Array.isArray(themeColors) && themeColors.length
            ? await patch("/users/@me/profile", { theme_colors: themeColors })
            : false;

        showNotification({
            title: "Copy Profile",
            body: `Cloned ${user.username}'s profile onto yours.` + (
                (Array.isArray(themeColors) && themeColors.length && !themeApplied)
                    ? " (profile theme needs Nitro on your account)"
                    : ""
            )
        });
    } catch (e) {
        console.error("[CopyProfile]", e);
        showToast({ text: "Failed to clone profile.", variant: "critical" });
    }
}

const patchUserContext: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!user) return;

    children.push(
        <Menu.MenuItem
            id="vault-copy-profile"
            label="Clone Profile to Me"
            icon={VaultIcon}
            action={() => Alerts.show({
                title: "Clone Profile",
                body: `This overwrites YOUR avatar, banner, bio and pronouns with ${user.username}'s. This changes your own account. Continue?`,
                confirmText: "Clone",
                cancelText: "Cancel",
                onConfirm: () => cloneProfile(user)
            })}
        />
    );
};

export default definePlugin({
    name: "CopyProfile",
    description: "Adds a 'Clone Profile to Me' option to the user menu that copies someone's avatar, banner, bio and pronouns onto your own account.",
    authors: [EquicordDevs.eqen],
    tags: ["Utility", "Friends"],
    contextMenus: {
        "user-context": patchUserContext
    }
});
