/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { EquicordDevs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import { RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Menu, Modal, openModal, RelationshipStore, RestAPI, showToast, SnowflakeUtils, TextArea, TextInput, useMemo, useRef, UserStore, useState } from "@webpack/common";

const settings = definePluginSettings({
    inactiveDays: {
        type: OptionType.NUMBER,
        description: "A friend counts as inactive when your last message with them is older than this many days (you can also pick the exact date in the window).",
        default: 180
    },
    removeDelayMs: {
        type: OptionType.NUMBER,
        description: "Delay between each friend removed, in milliseconds.",
        default: 1000
    },
    dmMessage: {
        type: OptionType.STRING,
        description: "Message sent to every friend by DM All Friends. You can still edit it in the window before sending.",
        default: ""
    },
    dmDelayMs: {
        type: OptionType.NUMBER,
        description: "Delay between each DM sent by DM All Friends, in milliseconds. Keep it high: many DMs in a row can get an account flagged.",
        default: 5000
    }
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const DAY = 24 * 60 * 60 * 1000;

interface Friend {
    id: string;
    name: string;
    /** Time of the last message in your DM with them (either side), or null when there is none. */
    lastMessageAt: number | null;
}

function listFriends(): Friend[] {
    return RelationshipStore.getFriendIDs().map(id => {
        const user: any = UserStore.getUser(id);
        const dmId = (ChannelStore as any).getDMFromUserId?.(id);
        const lastId = dmId ? (ChannelStore.getChannel(dmId) as any)?.lastMessageId : null;
        return {
            id,
            name: user?.globalName || user?.username || id,
            lastMessageAt: lastId ? SnowflakeUtils.extractTimestamp(lastId) : null
        };
    });
}

const toInputDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const showDate = (ms: number | null) => ms == null ? "never" : new Date(ms).toLocaleDateString();

/** A job shown inside a modal: progress, Stop, and it ends early after 5 refusals in a row. */
function useJob() {
    const [state, setState] = useState({ running: false, done: 0, failed: 0, total: 0, finished: false, lastError: "" });
    const stopRef = useRef(false);
    return {
        state,
        stop: () => { stopRef.current = true; },
        async start<T>(items: T[], delayMs: number, step: (item: T) => Promise<void>) {
            stopRef.current = false;
            let done = 0, failed = 0, lastError = "", failedInARow = 0;
            setState({ running: true, done, failed, total: items.length, finished: false, lastError });
            for (const item of items) {
                if (stopRef.current) break;
                try {
                    await step(item);
                    done++;
                    failedInARow = 0;
                } catch (err: any) {
                    failed++;
                    failedInARow++;
                    lastError = err?.body?.message ?? err?.message ?? String(err);
                    // a refusal that repeats would only hammer Discord: stop and say why
                    if (failedInARow >= 5) { stopRef.current = true; break; }
                }
                setState({ running: true, done, failed, total: items.length, finished: false, lastError });
                if (delayMs > 0) await sleep(delayMs);
            }
            setState({ running: false, done, failed, total: items.length, finished: true, lastError });
            return { done, failed, lastError };
        }
    };
}

function Progress({ job, verb }: { job: ReturnType<typeof useJob>; verb: string; }) {
    const { running, done, failed, total, finished, lastError } = job.state;
    if (!running && !finished) return null;
    return (
        <Paragraph style={{ marginTop: 12 }}>
            {running ? `${verb} ${done} / ${total}...` : `Finished: ${verb.toLowerCase()} ${done} / ${total}.`}
            {failed ? ` ${failed} failed${lastError ? ` (${lastError})` : ""}.` : ""}
        </Paragraph>
    );
}

// ---- Friend Cleanup ----------------------------------------------------------------------------------

function CleanupModal(props: RenderModalProps) {
    const [date, setDate] = useState(toInputDate(Date.now() - (settings.store.inactiveDays || 180) * DAY));
    const [unselected, setUnselected] = useState<Set<string>>(new Set());
    const [confirm, setConfirm] = useState<"selected" | "all" | null>(null);
    const [removed, setRemoved] = useState<Set<string>>(new Set());
    const job = useJob();

    const cutoff = date ? new Date(date + "T23:59:59").getTime() : 0;
    const inactive = useMemo(
        () => listFriends()
            .filter(f => (f.lastMessageAt == null || f.lastMessageAt < cutoff) && !removed.has(f.id))
            .sort((a, b) => (a.lastMessageAt ?? 0) - (b.lastMessageAt ?? 0)),
        [cutoff, removed]
    );
    const selected = inactive.filter(f => !unselected.has(f.id));
    const busy = job.state.running;
    const targets = confirm === "all" ? inactive : selected;

    async function run() {
        const list = targets.slice();
        setConfirm(null);
        const result = await job.start(list, Math.max(0, settings.store.removeDelayMs || 0), async f => {
            await RestAPI.del({ url: `/users/@me/relationships/${f.id}` });
            setRemoved(prev => new Set(prev).add(f.id));
        });
        showToast({ text: `Friend Cleanup: ${result.done} friend${result.done === 1 ? "" : "s"} removed${result.failed ? `, ${result.failed} failed` : ""}.`, variant: "success" });
    }

    return (
        <Modal
            {...props}
            title="Friend Cleanup"
            actions={[
                confirm
                    ? { text: `Confirm: remove ${targets.length} friend${targets.length === 1 ? "" : "s"}`, variant: "primary", disabled: busy || targets.length === 0, onClick: run }
                    : { text: `Remove selected (${selected.length})`, variant: "primary", disabled: busy || selected.length === 0, onClick: () => setConfirm("selected") },
                confirm
                    ? { text: "Back", variant: "secondary", disabled: busy, onClick: () => setConfirm(null) }
                    : { text: `Remove all listed (${inactive.length})`, variant: "secondary", disabled: busy || inactive.length === 0, onClick: () => setConfirm("all") },
                busy ? { text: "Stop", variant: "link", onClick: job.stop } : { text: "Close", variant: "link", onClick: props.onClose }
            ]}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Span weight="semibold" style={{ whiteSpace: "nowrap" }}>No message since</Span>
                <input
                    type="date"
                    value={date}
                    max={toInputDate(Date.now())}
                    onChange={e => { setDate(e.currentTarget.value); setConfirm(null); }}
                    disabled={busy}
                    style={{ background: "var(--input-background-default)", color: "var(--text-default)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: "6px 8px" }}
                />
            </div>
            <Paragraph color="text-muted" style={{ marginTop: 8 }}>
                Friends whose last message with you (sent by either of you) is before this date, or who never messaged you.
                Removing a friend cannot be undone: they have to accept a new request to be friends again.
            </Paragraph>
            {confirm && (
                <Paragraph style={{ marginTop: 10, color: "var(--status-danger)" }}>
                    You are about to remove {targets.length} friend{targets.length === 1 ? "" : "s"}. Press Confirm to continue.
                </Paragraph>
            )}
            <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
                <Button size="small" variant="secondary" disabled={busy} onClick={() => { setUnselected(new Set()); setConfirm(null); }}>Select all</Button>
                <Button size="small" variant="secondary" disabled={busy} onClick={() => { setUnselected(new Set(inactive.map(f => f.id))); setConfirm(null); }}>Select none</Button>
            </div>
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: 6, padding: "4px 10px" }}>
                {inactive.length === 0 && <Paragraph color="text-muted" style={{ padding: "10px 0" }}>No inactive friend for this date.</Paragraph>}
                {inactive.map(f => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: busy ? "default" : "pointer" }}>
                        <input
                            type="checkbox"
                            checked={!unselected.has(f.id)}
                            disabled={busy}
                            onChange={e => {
                                const next = new Set(unselected);
                                if (e.currentTarget.checked) next.delete(f.id); else next.add(f.id);
                                setUnselected(next);
                                setConfirm(null);
                            }}
                        />
                        <Span weight="semibold" style={{ flex: 1 }}>{f.name}</Span>
                        <Span color="text-muted">last message: {showDate(f.lastMessageAt)}</Span>
                    </label>
                ))}
            </div>
            <Progress job={job} verb="Removed" />
        </Modal>
    );
}

// ---- DM All Friends ----------------------------------------------------------------------------------

async function dmChannelOf(userId: string): Promise<string> {
    const known = (ChannelStore as any).getDMFromUserId?.(userId);
    if (known) return known;
    // creates the DM without opening it on screen
    const res = await RestAPI.post({ url: "/users/@me/channels", body: { recipients: [userId] } });
    return res.body.id;
}

function DmAllModal(props: RenderModalProps) {
    const [text, setText] = useState(settings.store.dmMessage ?? "");
    const [delay, setDelay] = useState(String(settings.store.dmDelayMs ?? 5000));
    const [confirm, setConfirm] = useState(false);
    const job = useJob();

    const friends = useMemo(() => listFriends(), []);
    const limit = ((UserStore.getCurrentUser() as any)?.premiumType ?? 0) > 0 ? 4000 : 2000;
    const message = text.slice(0, limit);
    const delayMs = Math.max(0, parseInt(delay, 10) || 0);
    const busy = job.state.running;

    async function run() {
        setConfirm(false);
        settings.store.dmMessage = text;
        settings.store.dmDelayMs = delayMs;
        const result = await job.start(friends, delayMs, async f => {
            const channelId = await dmChannelOf(f.id);
            await sendMessage(channelId, { content: message });
        });
        showToast({ text: `DM All Friends: ${result.done} message${result.done === 1 ? "" : "s"} sent${result.failed ? `, ${result.failed} failed` : ""}.`, variant: "success" });
    }

    return (
        <Modal
            {...props}
            title="DM All Friends"
            actions={[
                confirm
                    ? { text: `Confirm: send to ${friends.length} friends`, variant: "primary", disabled: busy, onClick: run }
                    : { text: `Send to ${friends.length} friend${friends.length === 1 ? "" : "s"}`, variant: "primary", disabled: busy || !message.trim() || friends.length === 0, onClick: () => setConfirm(true) },
                confirm ? { text: "Back", variant: "secondary", onClick: () => setConfirm(false) } : null,
                busy ? { text: "Stop", variant: "link", onClick: job.stop } : { text: "Close", variant: "link", onClick: props.onClose }
            ].filter(Boolean) as any}
        >
            <Paragraph color="text-muted" style={{ marginBottom: 10 }}>
                Sends this message by DM to each of your {friends.length} friends, one after the other. It is saved for next time.
            </Paragraph>
            <TextArea
                value={text}
                onChange={(v: string) => { setText(v); setConfirm(false); }}
                rows={6}
                placeholder="Your message..."
                disabled={busy}
                autoFocus
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <Span weight="semibold" style={{ whiteSpace: "nowrap" }}>Delay between messages (ms)</Span>
                <div style={{ width: 110 }}>
                    <TextInput type="number" value={delay} onChange={(v: string) => setDelay(v)} placeholder="5000" disabled={busy} />
                </div>
            </div>
            {confirm && (
                <Paragraph style={{ marginTop: 10, color: "var(--status-danger)" }}>
                    This sends {friends.length} private messages and cannot be unsent in one go. Press Confirm to start.
                </Paragraph>
            )}
            <Paragraph color="text-muted" style={{ marginTop: 12 }}>
                Many identical DMs in a short time can get an account rate-limited or flagged by Discord. A longer delay is safer.
            </Paragraph>
            <Progress job={job} verb="Sent" />
        </Modal>
    );
}

export default definePlugin({
    name: "FriendCleanup",
    description: "Vencord Toolbox actions: remove friends you have not messaged since a date you choose (pick some or all), and send one preset message by DM to all your friends.",
    authors: [EquicordDevs.eqen],
    enabledByDefault: true,
    tags: ["Utility", "Friends"],
    settings,

    toolboxActions() {
        return (
            <>
                <Menu.MenuItem id="vault-friend-cleanup" label="Friend Cleanup" action={() => openModal(p => <CleanupModal {...p} />)} />
                <Menu.MenuItem id="vault-dm-all-friends" label="DM All Friends" action={() => openModal(p => <DmAllModal {...p} />)} />
            </>
        );
    }
});
