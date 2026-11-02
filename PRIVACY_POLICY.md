# Confidentialité

Vault est un mod du client Discord. Vos messages et votre compte restent gérés par Discord, selon sa [politique de confidentialité](https://discord.com/privacy/). Vault lui-même ne transmet que ce qui est décrit ci-dessous.

## Badges Vault

Vault affiche des badges de profil (Owner, Staff, Donor, Bug Hunter, Helper, Member), visibles par les utilisateurs de Vault. Le badge Member vient avec l'installation de Vault ; les autres sont attribués par le propriétaire de Vault.

- Pour afficher votre badge **Member**, Vault envoie **uniquement votre identifiant Discord** au service de badges de Vault (hébergé chez Supabase, en Europe), qui le conserve avec les dates de première et de dernière visite. Rien d'autre n'est envoyé : ni messages, ni token, ni données de profil.
- Pour afficher les badges, Vault interroge le service sur les utilisateurs dont vous ouvrez le profil, par identifiant.
- La liste des membres ne peut pas être téléchargée : le service répond seulement sur les identifiants qu'on lui demande.
- Pour ne plus partager votre identifiant, désactivez **Afficher mon badge Membre** dans les réglages de Vault (section Badges Vault). Votre identifiant est alors supprimé du service.

## Synchronisation cloud

Le cloud est désactivé tant que vous ne l'activez pas. Si vous l'activez, vos réglages Vault sont envoyés au serveur choisi dans l'onglet Cloud : par défaut `cloud.equicord.org`, un service d'Equicord que Vault ne gère pas. Vous pouvez choisir un autre serveur dans cet onglet, ou exporter vos réglages en JSON sans passer par le cloud.

## Mises à jour

Vault contacte GitHub pour vérifier et télécharger ses mises à jour.

## Plugins

Certains plugins peuvent contacter des services tiers pour fonctionner. Ces échanges dépendent de chaque plugin et de ces services.
