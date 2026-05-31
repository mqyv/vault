# Installer Vault

Vault est un mod personnel pour le client Discord (basé sur la techno open-source Vencord/Equicord, sous licence GPL-3.0).

> ⚠️ Modifier le client Discord va à l'encontre des conditions d'utilisation de Discord. Utilisation à tes risques. C'est pour un usage personnel entre amis.

## Prérequis (à installer une fois)

1. **Node.js** (version 18+) — https://nodejs.org
2. **Git** — https://git-scm.com
3. **pnpm** — ouvre un terminal et tape : `npm install -g pnpm`

## Installation

```bash
# 1. Récupérer Vault
git clone https://github.com/mqyv/vault.git Vault
cd Vault

# 2. Installer les dépendances
pnpm install

# 3. Compiler
pnpm build

# 4. Fermer complètement Discord, puis injecter Vault
pnpm inject
```

Rouvre Discord : Vault apparaît dans les **Réglages** (onglet « Vault »).

## Mettre à jour

Quand Discord se met à jour et casse quelque chose :

```bash
pnpm update-vault   # récupère les correctifs
pnpm inject         # Discord fermé, ré-injecte
```

## Désinstaller

```bash
pnpm uninject
```
