# Contribuer à Vault

Les signalements de bugs, les idées et les corrections sont les bienvenus.

## Signaler un bug ou proposer une idée

Ouvrez une [issue](https://github.com/mqyv/vault/issues/new/choose) après avoir vérifié qu'elle n'existe pas déjà.

Vault se synchronise automatiquement avec [Equicord](https://github.com/Equicord/Equicord). Un bug dans un plugin qui n'est pas exclusif à Vault peut donc venir d'Equicord : précisez si vous l'avez aussi constaté là-bas.

## Proposer une modification

1. Pour un changement important, ouvrez d'abord une issue pour en discuter.
2. Installez le projet (voir la section [Développeurs](./README.md#développeurs) du README).
3. Lancez `pnpm test` et testez votre changement dans Discord.
4. Ouvrez une pull request vers `main`, avec un seul sujet par pull request.

## Écrire un plugin

Les plugins propres à Vault sont dans `src/equicordplugins`. Le guide [`.skills/authoring-plugins.md`](./.skills/authoring-plugins.md) explique comment les écrire.

## Licence

Vos contributions sont publiées sous la licence du projet, [GPL-3.0-or-later](./LICENSE).
