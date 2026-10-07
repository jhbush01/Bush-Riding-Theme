# Bush Riding — Design System

**Bush Riding** is an Australian brand for people who take the long way — gravel, high country, station tracks. The tagline is **"Made for the detour."**

## What governs what

Two sources, and they disagree. The rule the client has set:

> **The brand board is strict law for colour and type. The repo is law for structure, components and interaction.**

- **Brand board** (`uploads/Artboard 8.pdf` — logo concepts, `Artboard 9.pdf` — palette, `Artboard 10.pdf` — type) — the six-colour palette and the three-tier type system. **These values are non-negotiable and are what this system ships.**
- **`jhbush01/Bush-Riding-Theme`** (branch `main`, see `github.md`) — the live Shopify theme (re-uploads on every commit) and the Bush Map app at `/map`. This is where every component, layout, class name and interaction in this system comes from.

The theme's *current* colours and fonts (navy `#2E2F9E`, lavender haze, citrus `#E8F13C`, terracotta and plum map pins; Outfit and Instrument Serif) are **retired here** — they predate the board. The tokens keep the theme's variable names (`--alp-*`, and the map's `--cream`/`--olive`/`--plum` etc.) so existing theme markup keeps working, but every **value** is now the board's. Applying this system to the live theme is therefore a value swap, not a rewrite.

## Colour — the whole palette

| Token | Hex | Role |
| --- | --- | --- |
| `--bone` | `#edecc5` | the page |
| `--sage` | `#b8bca1` | muted surfaces, text on olive |
| `--mist` | `#a7b8b4` | cool secondary surface, water on the map |
| `--khaki` | `#817f57` | muted text, secondary accent, bush-event pins |
| `--olive` | `#4c4b3b` | **the ink and the primary** — all body copy, headings, fills |
| `--flare` | `#ece26a` | **the only accent** — one per screen |

White (`--paper`) is paper for card surfaces, not a brand colour — never a large field. Olive on bone is 7.3:1, so olive carries all text. There is **no red, no blue, no purple**: destructive actions read as khaki, and the map's three pin families are olive (routes), khaki (bush events) and flare (famous events). Derived tints are limited to one panel lift (`#f4f3dc`) and one card ground (`#eceada`), both flagged in `tokens/map.css`.

**Bone, Mist and Olive are the hex values printed on the board.** Sage, Khaki and Flare carry no printed hex, so they are read straight from the official logo artwork — `#b8bca1`, `#817f57`, `#ece26a`. Every value in the system now comes from a supplied source.

## Type — the three tiers

| Tier | Board specifies | Shipping as | Use |
| --- | --- | --- | --- |
| Display / logo | **DX Burst** | **DX Burst** *(exact — Regular + Smooth)* | Print display headings |
| Headings | **Aktiv Grotesk Semibold** | **Archivo 600** *(substitute)* | Subheadings and **all website headings** |
| Body | **Inter Regular** (web-safe) | **Inter** *(exact)* | All body copy |

**DX Burst is installed.** Two licensed cuts sit in `assets/fonts` and load via `@font-face` in `tokens/fonts.css`: `--font-display` (Regular, the rough brush edge) and `--font-display-smooth` (the cleaned edge). Inter is exact. **Aktiv Grotesk Semibold is the one remaining substitute** — Archivo 600 stands in; send the licensed `.woff2` and swap the `@import` for an `@font-face` rule.

### The logo is artwork, not a font

"Bush Riding" is **drawn artwork**, not type. It ships as vector in eight tones at `assets/logo/wordmark-<tone>.svg` — the six palette colours plus white and black for single-colour print — placed via `<img>` and sized by **height** so it always holds aspect ratio. `assets/logo/wordmark.svg` inherits `currentColor` where a tone needs to follow context.

**Bone on olive** is the default pairing; **olive on bone or flare** is the light-ground equivalent. Sage and mist are quiet placements on olive, khaki is the low-contrast mark on bone. The `Wordmark` component takes `tone` and `height`.

DX Burst is the brand display face and the mark was drawn from it, but the two are not interchangeable: **never typeset "Bush Riding" in DX Burst** — place the artwork. The header text around it (Shop, Explore, the clock) is the heading font. Matching 943×205 rasters are kept at `assets/logo/wordmark-<tone>.png` for email and Shopify theme settings, which cannot take SVG.

---
## Content fundamentals

Real copy from the theme sets the voice: **"Made for the detour."**, **"Explore more with our curated gravel routes and events"**, **"Get the route. Join the bush."**, **"We send the occasional route, nothing else."**

- **Register.** Dry, plain, outdoors-practical. A rider giving directions, not a brand selling a lifestyle. Short declaratives.
- **Person.** Second person for actions ("Get the route", "Take the long way home"); first person plural for the brand ("our curated routes", "we send…").
- **Casing.** Sentence case for headings and body. UPPERCASE letterspaced only for small labels/overlines (filter labels, footer column heads, card eyebrows). The storefront chips are 600-weight sentence case, not caps.
- **Numbers carry the detail.** 210 km, 3,140 m climb, shuts at four. Figures with a space before the unit.
- **Punctuation.** Full stops in prose; no exclamation marks; em dashes sparingly. A ™ rides on "Bush Riding™" and "BUSH MAP™" in chrome.
- **Australian English & specifics** — kilometres, gravel, high country, tar, bulldust, station tracks.
- **Emoji: none.** The one recurring glyph is **✦** on the storefront's Explore/Discover chips. Unicode ▾/×/★ appear as UI marks.

## Visual foundations

**One palette across both surfaces.** The storefront and Bush Map now draw from the same six colours; only their density differs — the storefront is editorial and airy, the map is dense and panelled. Map tokens are scoped under `.brm` so the two skins can coexist in one page without collision.

**Type.** One system everywhere: Aktiv Grotesk Semibold (→ Archivo 600) for every heading on both surfaces, Inter for every string of body and UI copy, DX Burst reserved for print display. The storefront's manifesto runs at `clamp(1.7rem,4.4vw,3.6rem)`; the giant footer wordmark uses the heading font at 600.

**Backgrounds.** Flat colour and full-bleed photography; no gradients as decoration (the map's ground is a soft radial cream, not a "gradient look"). The storefront home is **one non-scrolling screen**: a full-viewport hero with the header floated at its vertical centre and a single copyright line overlaid at the base. Inner pages scroll and clear the fixed header by 84px.

**Photography.** Warm, dusty, landscape-dominant, riders small in frame. Type over photos always sits on a scrim. None ships in the repo — the theme uses grey placeholder SVGs (`assets/alpine-ph-*.svg`, copied into the storefront kit), and those are what the UI kit shows.

**Corners.** Storefront chips are **3px**. Bush Map controls are **2px**; its filter pills are 999px; its sheets/cards round to **16–18px**. Nothing else rounds much — this is a flat, ink-on-paper system.

**Borders & shadows.** Hairlines everywhere — one line token, `rgba(76,75,59,.24)`, olive at 24%. Shadows are used sparingly and only where something genuinely floats: the map's frosted chrome pills, the route card, popups. The storefront is essentially shadowless.

**Transparency & blur.** The storefront header text is flare with a soft shadow so imagery reads through it (a blend-mode was tried and dropped — iOS can't blend over video). Bush Map's floating chrome (nav pill, tools, hamburger, logo) is bone at 82% with a 10px backdrop blur.

**Motion.** Restrained. Storefront: scroll-reveal fades (`translateY(24px)`, ~0.55s ease-out) and the Explore menu's **clip-path circle wipe** from the button (0.6s `cubic-bezier(.76,0,.24,1)`). Bush Map: 0.12–0.32s eases on toggles, the sheet slide, panels. No bounce, no parallax; `prefers-reduced-motion` is honoured in the source.

**States.** Storefront chip hover **inverts** to olive. Map toggles/pills fill olive when active and fade to 55% when off; result rows wash to `#e6e5c9`. Focus is a 2px **flare** ring throughout.

## Iconography

- **Storefront:** a small set of **inline SVG icons** drawn in the theme (cart, close, social: YouTube/Strava/Instagram), 1.7–1.8px stroke, `currentColor`. The repo's standalone `assets/icon-*.svg` (cart, close, caret, account, search, plus, minus, checkmark, error) are copied into this system's `assets/`.
- **Bush Map:** inline SVGs throughout — hamburger, pins, chevrons, pin/navigate/download/orbit glyphs, star rating (`★`), all 2px stroke `currentColor`.
- **No icon font, no icon library, no emoji.** The one decorative glyph is **✦**. If you need an icon not in the set, match the existing 2px-stroke, round-cap, `currentColor` style rather than importing a library.
- Do **not** hand-roll a version of the brush wordmark as an icon — it is the PNG.

---

## Index

Root: `styles.css` (the one entry consumers link), `readme.md`, `SKILL.md`, `github.md` (source repo + sync log), `thumbnail.html`.

- `tokens/` — `colors.css` (the palette), `typography.css`, `space.css`, `fonts.css`, `storefront.css` (`--alp-*` remapped), `map.css` (`.brm` scope), `base.css`
- `guidelines/` — 14 specimen cards → Design System tab, grouped **Colors, Type, Brand, Shape, Spacing**
- `assets/logo/` — the wordmark in eight tones, SVG + PNG, plus `wordmark.svg` (currentColor)
- `assets/fonts/` — the licensed DX Burst OTFs (Regular, Smooth)
- `assets/` — the theme's `icon-*.svg` and `alpine-ph-*` / `alpine-cut-*` placeholder art
- `components/` — the primitives, below
- `ui_kits/storefront/` — home page recreation (see the kit for details)
- `ui_kits/map/` — Bush Map routes screen recreation

### Components

Cut from the two surfaces' real CSS — this is the shipping inventory, not a generic UI set.

**Storefront** (`components/storefront/`, wrap nothing special):
- **Chip** — the one button/label (`.alp-chip`): default, `price`, `submit`; optional ✦ glyph
- **Wordmark** — the brush-PNG logo, sized by height
- **NavLink** — translucent header link, citrus on home
- **ProductCard** — 3:4 image with name + price chips overlaid
- **TextLink** — inline prose link, navy on hover

**Bush Map** (`components/map/`, mount inside a `.brm` element so the map tokens resolve):
- **Button** — `.button`: default / `primary` (ink fill) / `danger`
- **FilterPill** — category pill with a pin-colour dot (`.cat`)
- **Toggle** — segmented single-select (`.toggle-group`)
- **Field** — labelled input/textarea (`.field-input`)
- **Select** — compact filter dropdown (`.filter__select`)
- **Legend** — the three-pin legend
- **StatusBadge** — submission status pill (pending/approved/rejected)
- **Toast** — dark confirmation pill (`.brm-toast`)
- **ResultItem** — a row in the route results list (`.result`)
- **MapPill** — frosted floating layer nav (`.map-nav`)

**Intentional additions** (no source class of their own, added for reuse): **Wordmark** and **TextLink** wrap patterns the theme repeats inline; **Legend** packages the pin key.

## Open questions

1. **Aktiv Grotesk Semibold.** The one remaining substitute (Archivo 600). Send the licensed `.woff2` and the type stack is exact.
2. **Which DX Burst cut is default for print?** Regular (rough) is wired as `--font-display`; Smooth is available as `--font-display-smooth`.
3. **Destructive and status colours.** The palette has no red. Destructive currently reads as khaki and submission statuses use flare/sage/khaki. Confirm, or approve one off-palette red for errors only.
4. **Photography.** Both kits use the theme's grey placeholder art; real ride photos will change the character of the hero and route cards considerably.
5. **Rolling this into the theme.** The tokens keep the theme's variable names, so applying it live is a value swap in `assets/alpine.css` and `map/styles/app.css`. Want me to prepare that as a PR-ready diff?
