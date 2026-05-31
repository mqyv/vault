# Installer Vault

Vault est un mod personnel pour le client Discord.

> ⚠️ Modifier le client Discord va à l'encontre des conditions d'utilisation de Discord. Usage personnel, à tes risques.

---

## 🚀 Installation automatique (recommandée)

**Option A — Double-clic**
1. Télécharge **[`install-vault.bat`](https://raw.githubusercontent.com/mqyv/vault/main/install-vault.bat)** (clic droit → « Enregistrer sous »).
2. Double-clique dessus.
3. Laisse faire : il installe tout (Git, Node, pnpm), télécharge Vault, le compile et l'injecte dans Discord.
4. Rouvre Discord → Vault est dans les **Réglages** (onglet « Vault »).

**Option B — Une seule commande**
Ouvre **PowerShell** (touche Windows → tape `PowerShell` → Entrée) et colle :
```powershell
irm https://raw.githubusercontent.com/mqyv/vault/main/scripts/install-vault.ps1 | iex
```

L'installeur peut afficher une fenêtre Windows pour autoriser l'installation de Git/Node — clique **Oui**.

---

## Mettre à jour
Quand Discord se met à jour et casse quelque chose :
```powershell
pnpm -C "$HOME\Vault" update-vault
```
Puis rouvre Discord (ré-injection seulement si Discord lui-même a été mis à jour : relance l'installeur).

## Désinstaller
```powershell
pnpm -C "$HOME\Vault" uninject
```

---

## Installation manuelle (si tu préfères)
Prérequis : [Node.js 18+](https://nodejs.org), [Git](https://git-scm.com), puis `npm install -g pnpm`.
```bash
git clone https://github.com/mqyv/vault.git Vault
cd Vault
pnpm install
pnpm build
pnpm inject   # Discord fermé
```
