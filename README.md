<div align="center">

<img src="./site/icon.png" width="96" alt="Vault">

# Vault

**Le mod Discord aux plugins exclusifs : 370+ plugins, thèmes sur-mesure, mises à jour automatiques.**

[![Demander l'accès](https://img.shields.io/badge/Demander%20l'acc%C3%A8s-Discord-d8b46a?style=for-the-badge&logo=discord&logoColor=black)](https://discord.gg/q97W6EfMV6)

[![Tests](https://img.shields.io/github/actions/workflow/status/mqyv/vault/test.yml?branch=main&label=tests&style=flat-square)](https://github.com/mqyv/vault/actions/workflows/test.yml)

[Site](https://vaultcord.fr) · [Accès](#accès) · [Plugins exclusifs](#plugins-exclusifs) · [Développeurs](#développeurs)

</div>

---

## Pourquoi Vault

| Atout | Détail |
|---|---|
| **370+ plugins** | Un large catalogue, avec des plugins écrits pour Vault. |
| **Mises à jour invisibles** | Vault vérifie les correctifs chaque minute, sans relancer Discord, puis affiche une notification **Restart**. Un clic et c'est à jour. |
| **Thèmes sur-mesure** | Importez n'importe quel thème CSS, avec aperçu en direct. |
| **Cloud & sauvegarde** | Exportez vos réglages en JSON, ou synchronisez-les entre appareils si vous activez le cloud (service d'Equicord par défaut, voir la [politique de confidentialité](./PRIVACY_POLICY.md)). |
| **Accès privé** | Vault se demande sur le Discord et s'active avec une clé personnelle, liée à un compte et à un appareil. |

## Accès

Vault est privé : le code n'est pas distribué et il faut une clé personnelle pour l'installer.

1. Rejoignez le [Discord](https://discord.gg/q97W6EfMV6) et demandez l'accès dans le salon prévu.
2. Si c'est accepté, VaultBot vous envoie une clé en message privé. Activez-la avec `/claim` : le serveur s'ouvre.
3. Téléchargez l'installeur avec le bouton du bot, lancez-le et collez la même clé. Elle se lie à votre ordinateur au premier usage.

L'installeur vérifie la clé, télécharge Vault et l'ajoute à Discord. Vault se met ensuite à jour par le même service, tant que l'accès est valide. Si l'accès est retiré ou arrive à son terme, Vault se désinstalle et Discord redémarre sans lui.

Pour publier une version (propriétaire) : `pnpm release` (ajouter `--installer` pour republier aussi l'installeur).

## Désinstaller

Réglages de Discord → onglet Vault → *Désinstaller Vault*, ou menu Démarrer → *Désinstaller Vault* (ou *Paramètres → Applications*).

## Plugins exclusifs

| Plugin | Ce qu'il fait |
|---|---|
| **BulkSend** | Envoie plusieurs messages d'un coup (une ligne = un message) ou tout le texte en un seul. Délai réglable, répétition, envoi continu avec bouton Stop, et bloc de caractères invisibles. |
| **ClearMessages** | Supprime vos messages d'un salon, y compris depuis un message précis, avec un délai réglable en ms. |
| **CopyProfile** | Clone la bannière, la couleur et le thème de profil d'un utilisateur. |
| **FakeVoice** | Faux mute / sourd indépendants (clic gauche = mute, clic droit = sourd). |
| **BetterMicrophone** | Micro jusqu'à 510 kbps en stéréo, gain supplémentaire et mode studio qui coupe les traitements de Discord (expérimental). |
| **VaultPerformance** | Trois préréglages pour alléger Discord : Équilibré (sans flou), Performance (sans animations non plus, par défaut) et Maximum (sans ombres ni filtres). |

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

Le site vitrine est dans [`site/`](./site) (HTML statique, aucune étape de build).

## Licence et avertissement

Vault est un logiciel libre sous licence **[GPL-3.0](./LICENSE)**, dont le code repose sur [Equicord](https://github.com/Equicord/Equicord) et [Vencord](https://github.com/Vendicated/Vencord), merci à leurs auteurs. Discord est une marque de Discord Inc., citée à titre descriptif : aucune affiliation ni approbation de Discord Inc.

<details>
<summary>Modifier le client Discord enfreint les conditions d'utilisation de Discord</summary>

Les modifications du client vont à l'encontre des conditions d'utilisation de Discord. Dans les faits, Discord est plutôt indifférent à leur égard et aucun bannissement n'est connu pour l'usage d'un client mod. Mais si votre compte est essentiel, par prudence, évitez tout client mod. Évitez aussi de poster des captures montrant Vault dans un serveur où ça pourrait poser problème.

</details>
