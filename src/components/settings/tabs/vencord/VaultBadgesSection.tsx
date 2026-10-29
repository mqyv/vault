/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { BadgeType, checkOwnerKey, frameBadgeImage, getBadgeTypes, isOwner, loadBadgeTypes, setBadge, syncMembership } from "@utils/vaultBadges";
import { showToast, TextInput, useEffect, useRef, useState } from "@webpack/common";

function BadgeRow({ type, onChanged }: { type: BadgeType; onChanged(): void; }) {
    const [label, setLabel] = useState(type.label);
    const [busy, setBusy] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    async function save(iconUrl: string | null) {
        setBusy(true);
        try {
            await setBadge(type.key, label, iconUrl);
            showToast({ text: `Badge « ${label} » enregistré`, variant: "success" });
            onChanged();
        } catch (err: any) {
            showToast({ text: `Non enregistré : ${err?.message ?? err}`, variant: "critical" });
        } finally {
            setBusy(false);
        }
    }

    async function pickImage(file?: File) {
        if (!file) return;
        try {
            await save(await frameBadgeImage(file));
        } catch (err: any) {
            showToast({ text: `Image refusée : ${err?.message ?? err}`, variant: "critical" });
        }
    }

    return (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{ width: 22, height: 22, flex: "none", borderRadius: 4, background: "var(--background-mod-subtle)", display: "grid", placeItems: "center" }}>
                {type.icon_url
                    ? <img src={type.icon_url} width={20} height={20} alt="" />
                    : <span style={{ fontSize: 10, color: "var(--text-muted)" }}>—</span>}
            </div>
            <code style={{ width: 84, flex: "none", fontSize: 12, color: "var(--text-muted)" }}>{type.key}</code>
            <div style={{ flex: 1 }}>
                <TextInput value={label} onChange={setLabel} maxLength={40} />
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/webp,image/gif,image/jpeg,image/svg+xml" style={{ display: "none" }}
                onChange={e => pickImage(e.currentTarget.files?.[0])} />
            <Button size="small" disabled={busy} onClick={() => fileRef.current?.click()}>Image…</Button>
            <Button size="small" disabled={busy || label === type.label} onClick={() => save(null)}>Enregistrer</Button>
        </div>
    );
}

export function VaultBadgesSection() {
    const { vaultBadges } = useSettings(["vaultBadges.*"]);
    const [owner, setOwner] = useState(isOwner());
    const [types, setTypes] = useState(getBadgeTypes());
    const [keyDraft, setKeyDraft] = useState(vaultBadges.ownerKey ?? "");

    useEffect(() => { loadBadgeTypes().then(() => setTypes([...getBadgeTypes()])); }, []);

    async function saveKey() {
        vaultBadges.ownerKey = keyDraft.trim();
        const id = await checkOwnerKey();
        setOwner(id != null);
        showToast({ text: id ? "Clé owner reconnue" : keyDraft.trim() ? "Clé owner invalide" : "Clé owner retirée", variant: id || !keyDraft.trim() ? "success" : "critical" });
    }

    return (
        <section className={Margins.top20}>
            <Heading>Badges Vault</Heading>
            <Paragraph className={Margins.bottom16}>
                Badges visibles entre utilisateurs de Vault. Le badge Membre vient avec l'installation de Vault ; les autres sont attribués par les owners.
            </Paragraph>

            <FormSwitch
                title="Afficher mon badge Membre"
                description="Envoie uniquement ton identifiant Discord au service de badges de Vault. Désactiver le supprime du service."
                value={vaultBadges.showMembership}
                onChange={(v: boolean) => { vaultBadges.showMembership = v; syncMembership(); }}
                hideBorder
            />

            <Heading tag="h5" className={Margins.top16}>Clé owner</Heading>
            <Paragraph className={Margins.bottom8}>
                {owner
                    ? "Owner reconnu. Clic droit sur un utilisateur → Badges Vault pour lui donner ou retirer un badge."
                    : "Réservé aux owners : colle ici la clé qui t'a été donnée."}
            </Paragraph>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                    <TextInput type="password" value={keyDraft} onChange={setKeyDraft} placeholder="Clé owner" />
                </div>
                <Button size="small" onClick={saveKey}>Valider</Button>
            </div>

            {owner && (
                <>
                    <Heading tag="h5" className={Margins.top20}>Apparence des badges</Heading>
                    <Paragraph className={Margins.bottom16}>
                        Choisis une image (PNG transparent conseillé) : Vault la recadre automatiquement comme les badges de Discord (même taille, centrée). Un badge sans image n'est pas affiché. Les changements sont visibles chez tous les utilisateurs de Vault.
                    </Paragraph>
                    {types.map(t => <BadgeRow key={t.key} type={t} onChanged={() => setTypes([...getBadgeTypes()])} />)}
                </>
            )}
        </section>
    );
}
