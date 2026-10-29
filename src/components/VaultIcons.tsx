/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Icons of Vault's own plugins, drawn on Discord's 24px grid (solid shapes, rounded corners) so they sit naturally next
// to Discord's icons. They inherit `currentColor`.

import type { IconProps } from "@utils/types";

type Props = IconProps & { size?: number | string; };

const svgProps = ({ width, height, size = 20, className }: Props) => ({
    width: width ?? size,
    height: height ?? size,
    className,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const
});

/** BulkSend: a stack of messages, the front one filled with lines of text. */
export function BulkSendIcon(props: Props) {
    return (
        <svg {...svgProps(props)}>
            <path d="M16 6.5V6a2.5 2.5 0 0 0-2.5-2.5h-8A2.5 2.5 0 0 0 3 6v5.5A2.5 2.5 0 0 0 5.5 14H6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path fillRule="evenodd" fill="currentColor" d="M10.5 8.5h9A2.5 2.5 0 0 1 22 11v5.5a2.5 2.5 0 0 1-2.5 2.5H15l-3.6 2.9c-.5.4-1.2 0-1.2-.6V19A2.5 2.5 0 0 1 8 16.5V11a2.5 2.5 0 0 1 2.5-2.5ZM11 11.6h8v1.7h-8zM11 14.5h5v1.7h-5z" />
        </svg>
    );
}

/** CopyProfile: a profile card in front of its copy. */
export function CopyProfileIcon(props: Props) {
    return (
        <svg {...svgProps(props)}>
            <path d="M17 5.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path fillRule="evenodd" fill="currentColor" d="M9.5 7.5h10.5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9.5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Zm3 3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 1 0 0-4.4Zm-3.1 9a3.1 2.5 0 0 1 6.2 0ZM17 11.3h3.2v1.6H17ZM17 14.3h2.2v1.6H17Z" />
        </svg>
    );
}

/** ClearMessages: a message crossed out. */
export function ClearMessagesIcon(props: Props) {
    return (
        <svg {...svgProps(props)}>
            <path fillRule="evenodd" fill="currentColor" d="M5 3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-6.2l-4.7 3.7c-.5.4-1.1 0-1.1-.6V19H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm4.2 3.8L12 9.6l2.8-2.8 1.4 1.4L13.4 11l2.8 2.8-1.4 1.4L12 12.4l-2.8 2.8-1.4-1.4L10.6 11 7.8 8.2Z" />
        </svg>
    );
}

/** FakeVoice: a ghost (you are there, but others think you are not listening/speaking). */
export function FakeVoiceIcon(props: Props & { active?: boolean; }) {
    return (
        <svg {...svgProps(props)}>
            <path fillRule="evenodd" fill={props.active ? "var(--status-danger)" : "currentColor"} d="M12 2.5A7.5 7.5 0 0 0 4.5 10v10.4c0 .8.9 1.3 1.6.8l1.5-1.2 1.6 1.3c.4.3 1 .3 1.4 0L12 20l1.4 1.3c.4.3 1 .3 1.4 0l1.6-1.3 1.5 1.2c.7.5 1.6 0 1.6-.8V10A7.5 7.5 0 0 0 12 2.5ZM9.5 8.4c.8 0 1.4.8 1.4 1.8S10.3 12 9.5 12s-1.4-.8-1.4-1.8.6-1.8 1.4-1.8Zm5 0c.8 0 1.4.8 1.4 1.8s-.6 1.8-1.4 1.8-1.4-.8-1.4-1.8.6-1.8 1.4-1.8Z" />
        </svg>
    );
}
