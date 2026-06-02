/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { showNotification } from "@api/Notifications";
import { fetchUserProfile } from "@utils/discord";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Alerts, Menu, RestAPI, Toasts, UserProfileStore } from "@webpack/common";

interface UserContextProps {
    user?: User;
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

async function cloneProfile(user: User) {
    try {
        await fetchUserProfile(user.id);
        const profile: any = UserProfileStore.getUserProfile(user.id) ?? {};

        // --- avatar / banner (account-level) ---
        const me: Record<string, any> = {};
        if (user.avatar) me.avatar = await toDataUri(cdn("avatars", user.id, user.avatar));
        if (profile.banner) me.banner = await toDataUri(cdn("banners", user.id, profile.banner));
        if (Object.keys(me).length) await RestAPI.patch({ url: "/users/@me", body: me } as any);

        // --- bio / pronouns / accent (profile-level) ---
        const prof: Record<string, any> = {};
        if (profile.bio) prof.bio = profile.bio;
        if (profile.pronouns) prof.pronouns = profile.pronouns;
        if (profile.accentColor != null) prof.accent_color = profile.accentColor;
        if (Object.keys(prof).length) await RestAPI.patch({ url: "/users/@me/profile", body: prof } as any);

        showNotification({ title: "Copy Profile", body: `Cloned ${user.username}'s profile onto yours.` });
    } catch (e) {
        console.error("[CopyProfile]", e);
        Toasts.show({
            message: "Failed to clone profile (animated avatar/banner needs Nitro).",
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: { position: Toasts.Position.BOTTOM }
        });
    }
}

const patchUserContext: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!user) return;

    children.push(
        <Menu.MenuItem
            id="vault-copy-profile"
            label="Clone Profile to Me"
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
    authors: [{ name: "Vault", id: 0n }],
    tags: ["Utility", "Friends"],
    contextMenus: {
        "user-context": patchUserContext
    }
});
