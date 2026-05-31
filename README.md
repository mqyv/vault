# Vault

**Vault** est un mod personnel pour le client Discord : plus de **360 plugins**, des thèmes sur-mesure, et des mises à jour automatiques qui suivent Discord.

🌐 **Site** : https://vault-site-mu.vercel.app

---

## Installation

### Windows — installeur graphique (recommandé)
1. Télécharge **[VaultSetup.exe](https://github.com/mqyv/vault/releases/latest/download/VaultSetup.exe)**
2. Lance-le → **Suivant → Installer**
3. Rouvre Discord : Vault est dans tes **Réglages** (onglet « Vault »)

> Windows peut afficher « Windows a protégé votre PC » (installeur non signé) → **Informations complémentaires** → **Exécuter quand même**.

### Windows — en une commande (alternative)
Dans PowerShell :
```powershell
irm https://raw.githubusercontent.com/mqyv/vault/main/scripts/install-vault.ps1 | iex
```

---

## Mises à jour — automatiques

Tu n'as rien à faire. Au lancement, Vault récupère les derniers correctifs tout seul et affiche une notification **« Restart »** — comme une mise à jour de Discord. Un clic, et c'est à jour.

---

## Désinstaller
```powershell
pnpm -C "$HOME\Vault" uninject
```
(ou via *Ajout/Suppression de programmes* si tu as utilisé l'installeur graphique)

---

## Build manuel (développeurs)

Prérequis : [Git](https://git-scm.com/download) et [Node.js LTS](https://nodejs.org). Puis :

```shell
npm i -g pnpm
git clone https://github.com/mqyv/vault.git Vault
cd Vault
pnpm install
pnpm build
pnpm inject        # Discord fermé
```

---

## Licence

Vault est un logiciel libre sous licence **[GPL-3.0](./LICENSE)**. Tu es libre de le redistribuer sous certaines conditions ; voir la licence.

## Avertissement

Discord est une marque de Discord Inc., mentionnée uniquement à titre descriptif — aucune affiliation ni approbation de Discord Inc.

<details>
<summary>Modifier le client Discord enfreint les conditions d'utilisation de Discord</summary>

Les modifications du client vont à l'encontre des conditions d'utilisation de Discord. Dans les faits, Discord est plutôt indifférent à leur égard et aucun bannissement n'est connu pour l'usage d'un client mod. Mais si ton compte est essentiel, par prudence, évite tout client mod. Évite aussi de poster des captures montrant Vault dans un serveur où ça pourrait poser problème.

</details>