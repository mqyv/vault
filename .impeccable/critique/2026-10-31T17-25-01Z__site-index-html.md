---
target: site vaultcord.fr
total_score: 19
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 3
target_identity: "file:C:\\dev\\vault\\site\\index.html"
target_fingerprint: "sha256:7dfe333def4ed44d2bdc3889283360a7d3876d384d5301152bb824daf516133f"
target_path: "C:\\dev\\vault\\site\\index.html"
timestamp: 2026-10-31T17-25-01Z
slug: site-index-html
closed: true
---
Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Hero download starts silently, no next-step state |
| 2 | Match system / real world | 2 | "tu" everywhere vs brand "vous"; "Restart", "Injecter" unexplained |
| 3 | User control and freedom | 2 | Demo theme recolors and persists the whole site; #rows traps scroll; Export downloads a real file |
| 4 | Consistency and standards | 2 | Demo descriptions contradict #features; exclusives mixed with upstream plugins |
| 5 | Error prevention | 1 | Phones get the Windows .exe; hero CTA skips the SmartScreen warning |
| 6 | Recognition over recall | 3 | Install steps clear; Mac auto-detected |
| 7 | Flexibility and efficiency | n/a | Landing page |
| 8 | Aesthetic and minimalist | 2 | ~15 motion effects and ornament compete with the message |
| 9 | Error recovery | 1 | No troubleshooting: SmartScreen, failed install, revert |
| 10 | Help and documentation | 3 | FAQ covers basics; no support link |
| Total | | 19/36 | Acceptable (53%) |

Design specificity: half authored. #features (ruled list of the six exclusives) is specific and good. The rest is the stock premium-dark-SaaS kit: floating pill nav, pinging version pill, centered serif H1 with italic gold word and count-up, tilted floating mock window, drifting orbs, cursor glow, button shimmer, scroll progress bar, FAQ accordion, "Prêt à essayer ?" box with conic ring. Dead template CSS (.card, .grid, marquee). Detector: 0 findings. Contrast >= 6:1 everywhere, no overflow at 375px.

Priority issues:
- [P0] Message inverted: H1/title/OG/JSON-LD lead with "370+ plugins" (upstream's number); the six exclusives start ~1470px down. Fix: hero around the exclusives, 370+ as support. (typeset/clarify)
- [P1] Phones (main entry from Discord links) get a Windows .exe from nav and hero CTAs; no mobile nav. Fix: mobile branch, "Installez sur votre ordinateur" + share/copy link. (adapt)
- [P1] Install reassurance missing at the CTAs: SmartScreen note only inside a tab; ToS risk only in FAQ; no troubleshooting. (clarify/harden)
- [P1] Voice: "tu" everywhere; brand requires "vous" (copy, demo strings, JSON-LD). (clarify)
- [P2] Motion overload and template tells undercut trust; .rv opacity 0 with no no-JS fallback. (quieter)
- [P2] Demo window: inner scroll trap, site-wide persisted theme, real Export download, mixed/contradicting plugin list. (distill)

Personas: Jordan (ToS/SmartScreen surprises, no help path, exclusives may read as shady); Casey (exe on phone, no nav, scroll trap, cut tab, no way to send link to PC); Riley (real export, sticky theme, fake update check, no-JS invisible page, "0+ plugins" on load).

Minor: Bodoni 300 not loaded; inline styles; "Voir le code" secondary CTA for non-devs; no support link; og:image only the icon; purple ambient orb off-brand.
