/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Margins } from "@utils/margins";
import { checkLicence, forgetKey, getSavedKey, isOwnerAccount, LicenceState, saveKey } from "@utils/vaultLicence";
import { showToast, TextInput, useEffect, useState } from "@webpack/common";

function describe(state: LicenceState | null) {
    if (!state) return "Vérification…";
    switch (state.status) {
        case "owner": return "Compte propriétaire : aucune clé nécessaire.";
        case "none": return "Aucune clé enregistrée.";
        case "ok": return state.until
            ? `Accès actif jusqu'au ${new Date(state.until).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}.`
            : "Accès actif, sans limite de durée.";
        case "offline": return "Le service de clés ne répond pas pour l'instant.";
        case "ended": return "Accès terminé : Vault va se désinstaller.";
        default: return "La clé enregistrée n'est pas acceptée pour le moment.";
    }
}

export function VaultLicenceSection() {
    const [state, setState] = useState<LicenceState | null>(null);
    const [saved, setSaved] = useState<boolean | null>(null);
    const [key, setKey] = useState("");
    const [busy, setBusy] = useState(false);

    async function refresh() {
        setSaved(!!await getSavedKey());
        setState(await checkLicence());
    }

    useEffect(() => { refresh(); }, []);

    async function submit() {
        setBusy(true);
        const res = await saveKey(key);
        setBusy(false);
        if (res.ok) {
            setKey("");
            showToast({ text: "Clé activée sur cet appareil", variant: "success" });
            refresh();
        } else {
            showToast({ text: res.message, variant: "critical" });
        }
    }

    async function remove() {
        await forgetKey();
        showToast({ text: "Clé retirée de cet appareil", variant: "success" });
        refresh();
    }

    if (isOwnerAccount()) return null;

    return (
        <section className={Margins.top16}>
            <Heading>Clé d'accès</Heading>
            <Paragraph className={Margins.bottom8}>
                Vault est privé. Ta clé arrive en message privé quand ta demande est acceptée, puis tu l'actives avec /claim sur le serveur.
                Elle se lie à cet appareil la première fois. Si l'accès est retiré ou se termine, Vault se désinstalle tout seul.
            </Paragraph>
            <Paragraph className={Margins.bottom8}>{describe(state)}</Paragraph>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                    <TextInput
                        value={key}
                        onChange={setKey}
                        placeholder={saved ? "Une clé est déjà enregistrée" : "VAULT-XXXXXX-XXXXXX-XXXXXX-XXXXXX"}
                        maxLength={60}
                    />
                </div>
                <Button size="small" disabled={busy || !key.trim()} onClick={submit}>Activer</Button>
                {saved && <Button size="small" variant="secondary" disabled={busy} onClick={remove}>Retirer la clé</Button>}
            </div>
        </section>
    );
}
