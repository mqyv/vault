# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, in this order:

1. People who arrive from a link shared on Discord by someone already on Vault. They have decided to try it and want to install it without friction.
2. Strangers looking for a Discord client mod who compare Vault with Vencord, Equicord or BetterDiscord. They need a reason to pick Vault.

French-speaking, on Windows today, on macOS too (the owner is moving to a Mac). The site is read on desktop and on phones (links opened from the Discord mobile app).

## Product Purpose

Vault is a Discord desktop client mod. It installs on top of the official Discord app and adds plugins, themes, cloud backup of settings and silent automatic updates. vaultcord.fr explains it and gets people to install it.

Success: a visitor installs Vault, and a stranger understands what Vault has that the others do not.

## Positioning

Vault's own plugins (the list grows over time), written for Vault and found nowhere else, currently: BulkSend, ClearMessages, CopyProfile, FakeVoice, BetterMicrophone, VaultPerformance. This is the message a visitor must leave with. The rest of the catalogue (370+ plugins) comes from Equicord and Vencord and is credited to them.

## Operating Context

- Private: access is requested on the Discord, then activated with a personal key (one person, one device). No public installer.
- If access is revoked or expires, Vault removes itself and Discord restarts without it.
- Updates arrive by themselves; Discord shows a "Restart" notification.
- Vault badges are visible between Vault users; only the owner grants them.

## Capabilities and Constraints

- Free, open source, GPL-3.0. Built on Equicord and Vencord; they are credited in the footer and credits only.
- Modifying the Discord client breaks Discord's terms of service; the site keeps the existing, honest warning.
- Static site in `site/` (plain HTML/CSS/JS, no build step), deployed on Vercel at https://vaultcord.fr.
- Performance figures shown on the site are illustrations, not measurements, and are labelled as such.

## Brand Commitments

- Name: Vault. Domain: vaultcord.fr. Logo: the gold double V on a near-black tile (`site/icon.svg`).
- Voice: French, formal "vous", sober and factual. No hype, no jargon.
- Not affiliated with Discord Inc.; Discord is named descriptively only.

## Evidence on Hand

- The six Vault plugins and what each does (README, `src/equicordplugins/`).
- Real install commands and the installer.
- No testimonials, user counts, reviews or press exist. Do not invent any.

## Product Principles

1. The exclusive plugins lead; the catalogue size supports them.
2. Installing must look as easy as it is: one download or one command per system.
3. Say only what is true: credit upstream, label illustrations, keep the ToS warning.
4. Sober over flashy: the visitor should trust what they install.
