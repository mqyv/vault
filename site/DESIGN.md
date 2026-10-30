# Vault site — design system

Based on the Doppler style from Refero Styles (https://styles.refero.design/style/10654184-eb92-4b75-a7af-bd92bc6cdc5c), adapted to Vault.
Mood: a violet-lit vault at midnight. A near-black plum canvas, one lavender voice for the brand, one green light for "go".

## Colours

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#1c1624` | Page background, full-bleed sections |
| `--card` | `#2d2734` | Cards, the demo window, code blocks, inputs |
| `--panel` | `#3a3340` | One step above cards: hover fills, toggles at rest |
| `--text` | `#f1f0ec` | Primary text (never pure white) |
| `--text2` | `#d0c9c4` | Body text inside cards |
| `--muted` | `#a5a2a5` | Helper text, metadata |
| `--edge` | `#55505b` | Resting borders of ghost buttons and inputs |
| `--hair` | `rgba(229,231,235,.12)` | Hairline borders between and around surfaces |
| `--accent` | `#b997ff` | Brand voice: logo, eyebrows, highlighted words, selected states. Never a button fill, never body text |
| `--go` | `#00f575` | The single most important action per screen (Download). Black label |
| `--violet` / `--pink` / `--ember` | `#6b13f5` / `#ff9efa` / `#ff5632` | Aurora glow behind the hero and the headline gradient only |

Colour is rationed: green means "click", lavender means "Vault is speaking". They never swap roles.
The demo window's theme picker swaps `--accent` live; everything that uses the accent follows it.

## Type

One family: **Geist** (variable, Google Fonts), standing in for Doppler Repro. **Geist Mono** only for code and the window breadcrumb.

| Role | Size | Weight | Line height | Tracking |
|---|---|---|---|---|
| Display (hero) | 42–76px fluid | 700 | 1.02 | -0.02em |
| Heading | 32–48px fluid | 500 | 1.08 | -0.02em |
| Card title | 20–24px | 500 | 1.2 | -0.01em |
| Subheading | 18px | 450 | 1.4 | -0.01em |
| Body | 16px | 450 | 1.5 | 0 |
| Small | 14px | 450 | 1.5 | 0 |
| Eyebrow / caption | 12px | 500 | 1.5 | 0.03em, uppercase |

450 is the default weight for body and UI; 500 for headings; 700 only at display size.
One or two words of the hero headline take the violet→ember gradient (`linear-gradient(91deg,#855aff,#ff5632)`).

## Shape and space

- Radius: cards 20px, buttons 12px, small elements (tags, toggles' track ends aside) 8px, pills 9999px.
- Spacing on an 8px base: 8, 16, 24, 32, 40, 56, 80, 120.
- Container 1200px, card padding 32px, element gap 16px.
- No drop shadows on cards: surfaces are separated by colour steps and hairlines. The only glow is around the demo window: `0 0 60px rgba(185,151,255,.15)`.

## Components

- **Glass header**: sticky, full width, canvas at 80% with blur, hairline bottom border. Logo left, links, ghost GitHub button, green Download button.
- **Primary button**: green fill, black label, 12px radius, 12px × 24px padding, arrow after the label. One or two per screen at most.
- **Ghost button**: transparent, 1px `--edge` border, `--text` label.
- **Card**: `--card` fill, hairline border, 20px radius, 32px padding; heading 24px/500, body 15px in `--text2`.
- **Product frame**: the interactive settings window is the hero visual, on the right half of the hero, with the lavender glow and the aurora behind it.
- **Eyebrow**: 12px uppercase lavender label above section headings.

## Layout

Centred and symmetric. Hero is a two-column split (copy left, product right) that stacks under 900px. Features are a 3-column card grid (2 then 1 on smaller screens). No photography or illustration: the product UI is the picture.

## Motion

Entrance fade-up for the hero, count-up on "370", slow drifting aurora, the demo window floats and tilts toward the pointer, cards rise and catch a lavender spotlight on hover, install steps light up in order, FAQ answers expand smoothly, a lavender ring circles the final call to action. Everything stops under `prefers-reduced-motion`.
