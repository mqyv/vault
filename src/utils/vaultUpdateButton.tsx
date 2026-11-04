/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// A green pill in Discord's top bar, next to the inbox and help buttons, while a Vault update is waiting. Unlike the
// notice bar it can't be missed or closed by accident: it stays until the update is installed, comes back at every start
// of Discord, and a click updates Vault and restarts Discord.

import { addHeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { RestartIcon, UpdaterIcon } from "@components/Icons";
import { Clickable, showToast, Tooltip, useState } from "@webpack/common";

import { relaunch } from "./native";
import { update, UpdateLogger } from "./updater";

/** "available": a newer version exists. "installed": it is installed and Discord must restart to use it. */
export type UpdateState = "available" | "installed" | null;

const BUTTON_ID = "vault-update";
// lower numbers sit further left: the pill goes first, then the usual buttons
const PRIORITY = -100;
const GREEN = "#23a55a", GREEN_HOVER = "#1a8f4b";

let state: UpdateState = null;
let busy = false;

export const getUpdateState = () => state;

export function setUpdateState(next: UpdateState) {
    if (next === state) return;
    state = next;
    if (next === null) removeHeaderBarButton(BUTTON_ID);
    // same id when only the state changes: the button is replaced and redraws with the new label
    else addHeaderBarButton(BUTTON_ID, UpdatePill, PRIORITY);
}

async function applyUpdate() {
    if (busy) return;
    busy = true;
    try {
        if (state === "available") {
            showToast({ text: "Updating Vault…" });
            if (!await update()) {
                showToast({ text: "Vault could not be updated. Try again from the Updater tab.", variant: "critical" });
                return;
            }
            setUpdateState("installed");
        }
        relaunch();
    } catch (err) {
        UpdateLogger.error("Failed to update", err);
        showToast({ text: "Vault could not be updated. Try again from the Updater tab.", variant: "critical" });
    } finally {
        busy = false;
    }
}

function UpdatePill() {
    const [hover, setHover] = useState(false);
    const installed = state === "installed";
    const Icon = installed ? RestartIcon : UpdaterIcon;
    const label = installed ? "Restart to update" : "New Vault update";
    const tooltip = installed
        ? "Vault is updated: restart Discord to use the new version"
        : "A new version of Vault is ready: click to update and restart Discord";

    return (
        <Tooltip text={tooltip} position="bottom">
            {({ onMouseEnter, onMouseLeave }) => (
                <Clickable
                    role="button"
                    tabIndex={0}
                    aria-label={tooltip}
                    onClick={applyUpdate}
                    onMouseEnter={() => { onMouseEnter(); setHover(true); }}
                    onMouseLeave={() => { onMouseLeave(); setHover(false); }}
                    style={{
                        display: "flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", marginRight: 6,
                        borderRadius: 12, background: hover ? GREEN_HOVER : GREEN, color: "#fff", cursor: "pointer",
                        font: "600 12px var(--font-primary)", whiteSpace: "nowrap", transition: "background-color .15s"
                    }}
                >
                    <Icon width={14} height={14} />
                    {label}
                </Clickable>
            )}
        </Tooltip>
    );
}
