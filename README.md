<div align="center">

<img src="./site/icon.png" width="96" alt="Vault">

# Vault

**Le mod Discord privé : 370+ plugins, thèmes sur-mesure, mises à jour automatiques.**

[![Télécharger](https://img.shields.io/badge/T%C3%A9l%C3%A9charger-VaultSetup.exe-d8b46a?style=for-the-badge&logo=windows&logoColor=black)](https://github.com/mqyv/vault/releases/latest/download/VaultSetup.exe)

[![Tests](https://img.shields.io/github/actions/workflow/status/mqyv/vault/test.yml?branch=main&label=tests&style=flat-square)](https://github.com/mqyv/vault/actions/workflows/test.yml)
[![Licence](https://img.shields.io/badge/licence-GPL--3.0-blue?style=flat-square)](./LICENSE)
[![Dernière version](https://img.shields.io/github/v/release/mqyv/vault?style=flat-square&label=installeur)](https://github.com/mqyv/vault/releases/latest)

[Site](https://vaultmod.vercel.app) · [Installation](#installation) · [Plugins exclusifs](#plugins-exclusifs) · [Développeurs](#développeurs)

</div>

---

## Pourquoi Vault

| Atout | Détail |
|---|---|
| **370+ plugins** | La base d'[Equicord](https://github.com/Equicord/Equicord) et [Vencord](https://github.com/Vendicated/Vencord), plus des plugins exclusifs. |
| **Mises à jour invisibles** | Au lancement, Vault récupère les correctifs et affiche une notification **Restart**. Un clic et c'est à jour. |
| **Thèmes sur-mesure** | Importe n'importe quel thème CSS, aperçu en direct. |
| **Cloud & sauvegarde** | Synchronise tes réglages entre appareils ou exporte-les en JSON. |
| **Open source** | Code sous licence GPL-3.0, lisible et modifiable. |

## Installation

### Windows : installeur graphique (recommandé)

1. Télécharge **[VaultSetup.exe](https://github.com/mqyv/vault/releases/latest/download/VaultSetup.exe)**
2. Lance-le puis **Suivant → Installer** (il installe Git et Node.js si besoin)
3. Rouvre Discord : Vault est dans tes **Réglages**, onglet « Vault »

> Windows peut afficher « Windows a protégé votre PC » (installeur non signé) : clique sur **Informations complémentaires → Exécuter quand même**.

### Windows : une commande

Dans PowerShell :

```powershell
irm https://raw.githubusercontent.com/mqyv/vault/main/scripts/install-vault.ps1 | iex
```

En cas de problème, le journal complet est dans `%TEMP%\vault-install.log`.

## Mises à jour

Rien à faire : Vault se met à jour tout seul. Si Discord change et casse quelque chose, mets à jour à la main puis relance Discord :

```powershell
pnpm -C "$HOME\Vault" update-vault
```

## Désinstaller

```powershell
pnpm -C "$HOME\Vault" uninject
```

Ou via *Ajout/Suppression de programmes* si tu as utilisé l'installeur graphique.

## Plugins exclusifs

| Plugin | Ce qu'il fait |
|---|---|
| **BulkSend** | Envoie plusieurs messages d'un coup (une ligne = un message), délai réglable en ms. |
| **ClearMessages** | Supprime tes messages d'un salon, y compris depuis un message précis. |
| **CopyProfile** | Clone la bannière, la couleur et le thème de profil d'un utilisateur. |
| **FakeVoice** | Faux mute / sourd indépendants (clic gauche = mute, clic droit = sourd). |
| **BetterMicrophone** | Débloque le bitrate du micro (expérimental). |
| **VaultPerformance** | Préréglage de performance, activé par défaut. |

## Développeurs

Prérequis : [Git](https://git-scm.com/download) et [Node.js](https://nodejs.org) 22 ou plus.

```shell
npm i -g pnpm
git clone https://github.com/mqyv/vault.git Vault
cd Vault
pnpm install
pnpm build
pnpm inject        # Discord fermé
```

| Commande | Rôle |
|---|---|
| `pnpm build` | Compile Vault |
| `pnpm test` | Build, typecheck, lint, vérification des patchs (comme le CI) |
| `pnpm update-vault` | `git pull` + dépendances + build |
| `pnpm inject` / `pnpm uninject` | Ajoute / retire Vault de Discord |

Le site vitrine est dans [`site/`](./site) (HTML statique, aucune étape de build). L'installeur Windows (`installer/vault.iss`) est recompilé automatiquement par GitHub Actions.

## Licence et avertissement

Vault est un logiciel libre sous licence **[GPL-3.0](./LICENSE)**, basé sur Equicord et Vencord. Discord est une marque de Discord Inc., citée à titre descriptif : aucune affiliation ni approbation de Discord Inc.

<details>
<summary>Modifier le client Discord enfreint les conditions d'utilisation de Discord</summary>

Les modifications du client vont à l'encontre des conditions d'utilisation de Discord. Dans les faits, Discord est plutôt indifférent à leur égard et aucun bannissement n'est connu pour l'usage d'un client mod. Mais si ton compte est essentiel, par prudence, évite tout client mod. Évite aussi de poster des captures montrant Vault dans un serveur où ça pourrait poser problème.

</details>
