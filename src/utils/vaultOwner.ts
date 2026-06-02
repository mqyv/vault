/*
 * Vault, a Discord client mod
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

/** eqen's Discord user id — owner of this Vault build. */
export const VAULT_OWNER_ID = "1483151471183921346";

/**
 * Returns the Vault owner's current Discord avatar URL, or null if it can't be
 * resolved yet. On the owner's own client this always resolves (current user).
 */
export function getVaultOwnerAvatarURL(): string | null {
    const current = UserStore.getCurrentUser?.();
    const user = (current?.id === VAULT_OWNER_ID ? current : null) ?? UserStore.getUser?.(VAULT_OWNER_ID);
    return (user as any)?.getAvatarURL?.() ?? null;
}
