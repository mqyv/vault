/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

import blur from "./blur.css?managed";
import effects from "./effects.css?managed";
import motion from "./motion.css?managed";

// each level adds to the previous one
const LEVELS = {
    balanced: [blur],
    performance: [blur, motion],
    maximum: [blur, motion, effects]
};

const ALL = [blur, motion, effects];

function apply() {
    const wanted = new Set<string>(LEVELS[settings.store.preset] ?? LEVELS.performance);
    for (const style of ALL) {
        if (wanted.has(style)) enableStyle(style);
        else disableStyle(style);
    }
}

const settings = definePluginSettings({
    preset: {
        type: OptionType.SELECT,
        description: "Ce que Vault retire à l'apparence de Discord pour l'alléger",
        options: [
            { label: "Équilibré : sans effets de flou", value: "balanced" },
            { label: "Performance : sans flou, animations ni transitions", value: "performance", default: true },
            { label: "Maximum : sans ombres ni filtres en plus", value: "maximum" }
        ],
        onChange: apply
    }
});

export default definePlugin({
    name: "VaultPerformance",
    description: "Allège Discord pour le rendre plus rapide. Trois préréglages : Équilibré (sans flou), Performance (sans animations non plus) et Maximum (sans ombres ni filtres non plus).",
    authors: [EquicordDevs.eqen],
    tags: ["Appearance"],
    enabledByDefault: true,
    settings,
    start: apply,
    stop() {
        for (const style of ALL) disableStyle(style);
    }
});
