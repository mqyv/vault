/*!
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// DO NOT REMOVE UNLESS YOU WISH TO FACE THE WRATH OF THE CIRCULAR DEPENDENCY DEMON!!!!!!!
import "~plugins";
import "./fixWeirdAppRegionBug.css";

import nativeTitleBarStyles from "./nativeTitleBar.css?managed";

export * as Api from "./api";
export * as Plugins from "./api/PluginManager";
export * as Components from "./components";
export * as Util from "./utils";
export * as Updater from "./utils/updater";
export * as Webpack from "./webpack";
export * as WebpackPatcher from "./webpack/patchWebpack";
export { PlainSettings, Settings };

import { enableStyle, initStyles } from "@api/Styles";
import { debounce } from "@shared/debounce";
import { StartAt } from "@utils/types";
import { SettingsRouter } from "@webpack/common";

import { get as dsGet } from "./api/DataStore";
import { showNotice } from "./api/Notices";
import { showNotification } from "./api/Notifications";
import { initPluginManager, PMLogger, startAllPlugins } from "./api/PluginManager";
import { PlainSettings, Settings, SettingsStore } from "./api/Settings";
import { areLocalSettingsDirty, getCloudSettings, getCloudSyncDirection, markLocalSettingsDirty, putCloudSettings, shouldCloudSync } from "./api/SettingsSync/cloudSync";
import { relaunch } from "./utils/native";
import { changes, checkForUpdates, update, UpdateLogger } from "./utils/updater";
import { initVaultBadges } from "./utils/vaultBadges";
import { startVaultLicence } from "./utils/vaultLicence";
import { getUpdateState, setUpdateState } from "./utils/vaultUpdateButton";
import { onceReady } from "./webpack";
import { patches } from "./webpack/patchWebpack";

if (IS_REPORTER) {
    require("./debug/runReporter");
}

async function syncSettings() {
    const hasCloudAuth = await dsGet("Vencord_cloudSecret");
    if (!hasCloudAuth) {
        if (Settings.cloud.authenticated) {
            // User switched to an account that isn't connected to cloud
            showNotification({
                title: "Cloud Settings",
                body: "Cloud sync was disabled because this account isn't connected to the cloud App. You can enable it again by connecting this account in Cloud Settings. (note: it will store your preferences separately)",
                color: "var(--yellow-360)",
                onClick: () => SettingsRouter.openUserSettings("equicord_cloud_panel")
            });
            // Disable cloud sync globally
            Settings.cloud.authenticated = false;
        }
        return;
    }

    // pre-check for local shared settings
    if (
        Settings.cloud.authenticated &&
        !hasCloudAuth // this has been enabled due to local settings share or some other bug
    ) {
        // show a notification letting them know and tell them how to fix it
        showNotification({
            title: "Cloud Integrations",
            body: "We've noticed you have cloud integrations enabled in another client! Due to limitations, you will " +
                "need to re-authenticate to continue using them. Click here to go to the settings page to do so!",
            color: "var(--yellow-360)",
            onClick: () => SettingsRouter.openUserSettings("equicord_cloud_panel"),
            noPersist: true
        });
        return;
    }

    if (
        Settings.cloud.settingsSync && // if it's enabled
        Settings.cloud.authenticated && // if cloud integrations are enabled
        getCloudSyncDirection() !== "manual" // if we're not in manual mode
    ) {
        if (areLocalSettingsDirty() && shouldCloudSync("push")) {
            await putCloudSettings();
        } else if (shouldCloudSync("pull") && await getCloudSettings(false)) { // if we synchronized something (false means no sync)
            // we show a notification here instead of allowing getCloudSettings() to show one to declutter the amount of
            // potential notifications that might occur. getCloudSettings() will always send a notification regardless if
            // there was an error to notify the user, but besides that we only want to show one notification instead of all
            // of the possible ones it has (such as when your settings are newer).
            showNotification({
                title: "Cloud Settings",
                body: "Your settings have been updated! Click here to restart to fully apply changes!",
                color: "var(--green-360)",
                onClick: relaunch
            });
        }
    }

    const saveSettingsOnFrequentAction = debounce(async () => {
        if (Settings.cloud.settingsSync && Settings.cloud.authenticated && shouldCloudSync("push")) {
            await putCloudSettings();
        }
    }, 60_000);

    SettingsStore.addGlobalChangeListener(() => {
        markLocalSettingsDirty();
        saveSettingsOnFrequentAction();
    });
}

// New versions show up while Discord is open, without waiting for its next start
const UPDATE_CHECK_INTERVAL = 60_000;

let checkingForUpdates = false;
// a version that failed to install: nothing more to do until a newer one comes out
let failedUpdate: string | undefined;

async function runUpdateCheck() {
    if (IS_UPDATER_DISABLED) return;

    try {
        const isOutdated = await checkForUpdates();
        if (!isOutdated) {
            if (getUpdateState() === "available") setUpdateState(null);
            return;
        }

        const latest = changes[0]?.hash;

        if (Settings.autoUpdate) {
            if (latest === failedUpdate) return;

            failedUpdate = latest;
            if (!await update()) return;
            failedUpdate = undefined;
            // the green pill in the top bar is the only reminder: no second notice
            if (Settings.autoUpdateNotification) setUpdateState("installed");
            return;
        }

        // Nothing is installed without the person's say-so. The green pill stays in the top bar for as long as the update
        // waits and comes back at every start of Discord; a click on it updates Vault and restarts Discord.
        setUpdateState("available");
    } catch (err) {
        UpdateLogger.error("Failed to check for updates", err);
    } finally {
        checkingForUpdates = false;
    }
}

async function init() {
    await onceReady;
    // first and on its own: a plugin failing to start must never take the owner's badge menu down with it
    initVaultBadges();
    startAllPlugins(StartAt.WebpackReady);

    syncSettings();

    if (!IS_DEV && !IS_WEB && !IS_UPDATER_DISABLED) {
        // Updates used to install silently. Once, everyone is moved to "ask first" (it can be switched back in the Updater tab)
        if (!Settings.updateAskMigrated) {
            Settings.autoUpdate = false;
            Settings.updateAskMigrated = true;
        }
        runUpdateCheck();
        setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL);
        // private build: an access that ended removes Vault and restarts Discord without it
        startVaultLicence();
    }

    if (IS_DEV) {
        const pendingPatches = patches.filter(p => !p.all && p.predicate?.() !== false);
        if (pendingPatches.length)
            PMLogger.warn(
                "Webpack has finished initialising, but some patches haven't been applied yet.",
                "This might be expected since some Modules are lazy loaded, but please verify",
                "that all plugins are working as intended.",
                "You are seeing this warning because this is a Development build of Vault.",
                "\nThe following patches have not been applied:",
                "\n\n" + pendingPatches.map(p => `${p.plugin}: ${p.find}`).join("\n")
            );
    }
}

initPluginManager();
initStyles();
startAllPlugins(StartAt.Init);
init();

document.addEventListener("DOMContentLoaded", () => {
    startAllPlugins(StartAt.DOMContentLoaded);

    if (IS_DISCORD_DESKTOP && Settings.nativeTitleBar) {
        enableStyle(nativeTitleBarStyles);
    }
}, { once: true });
