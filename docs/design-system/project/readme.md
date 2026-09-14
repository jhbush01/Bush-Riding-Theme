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
| `--sage` | `#b9bea3` | muted surfaces, text on olive |
| `--mist` | `#a7b8b4` | cool secondary surface, water on the map |
| `--khaki` | `#828059` | muted text, secondary accent, bush-event pins |
| `--olive` | `#4c4b3b` | **the ink and the primary** — all body copy, headings, fills |
| `--flare` | `#ede270` | **the only accent** — one per screen |

White (`--paper`) is paper for card surfaces, not a brand colour — never a large field. Olive on bone is 7.3:1, so olive carries all text. There is **no red, no blue, no purple**: destructive actions read as khaki, and the map's three pin families are olive (routes), khaki (bush events) and flare (famous events). Derived tints are limited to one panel lift (`#f4f3dc`) and one card ground (`#eceada`), both flagged in `tokens/map.css`.

**Bone, Mist and Olive are the hex values printed on the board.** Sage, Khaki and Flare appear as swatches on the same board but carry no printed hex — those three are colour-matched from the artwork and are the only values in this system not taken verbatim from a source.

## Type — the three tiers

| Tier | Board specifies | Shipping as | Use |
| --- | --- | --- | --- |
| Display / logo | **DX Burst** | **Caveat Brush** *(substitute)* | The wordmark and print display headings |
| Headings | **Aktiv Grotesk Semibold** | **Archivo 600** *(substitute)* | Subheadings and **all website headings** |
| Body | **Inter Regular** (web-safe) | **Inter** *(exact)* | All body copy |

**Substitutions flagged:** no font binaries were supplied. Caveat Brush and Archivo are the nearest free matches; Inter is exact. **Send the licensed `.woff2` files** (DX Burst + Aktiv Grotesk) and swap the `@import` in `tokens/fonts.css` for `@font-face` rules — nothing else needs to change.

### The logo is artwork, not a font

"Bush Riding" is a **hand-painted brush wordmark** in DX Burst — a cream-on-transparent **PNG** at `assets/logo-wordmark.png`, shown via `<img>` and sized by height. The board presents it in **three brush-edge treatments — rough, in between, smooth** — differing only in edge fidelity; one of the three is official and that file replaces the shared asset. No typeface reproduces it; never typeset it, and never substitute Caveat Brush for the mark itself. The header text around it (Shop, Explore, the clock) is the heading font.

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

**One palette across both surfaces.** The storefront and Bush Map now draw from the same six colours; only their density differs — inner storefront pages stay editorial, the map is dense and panelled. Map tokens are scoped under `.brm` so the two skins can coexist in one page without collision.

**Density is set per surface, and the home page is dense.** The original storefront was airy by default; that read as unfinished on desktop, where a new brand with four short sections leaves most of the viewport empty. The home page now runs compact: a numbered ethos ledger (2–3 columns of one-line landscape entries, hairline-separated, khaki numerals) carries the brand story, and section padding is tightened under `body.template-index` — `.alp-collection`, `.alp-gate`, `.alp-trio` and `.alp-manifesto--page` all drop to home-scoped clamps. Inner pages keep the airier defaults; the tightening is scoped so it doesn't leak into collection, product or policy templates.

**Type.** One system everywhere: Aktiv Grotesk Semibold (→ Archivo 600) for every heading on both surfaces, Inter for every string of body and UI copy, DX Burst (→ Caveat Brush) reserved for print display. The storefront's manifesto runs at `clamp(1.7rem,4.4vw,3.6rem)`; the giant footer wordmark uses the heading font at 600.

**Backgrounds.** Flat colour and full-bleed photography; no gradients as decoration (the map's ground is a soft radial cream, not a "gradient look"). The storefront home **opens** on a full-viewport gate — hero photography with the header floated at its vertical centre and a single copyright line overlaid at the base — and then scrolls: gate → photo trio → ethos → manifesto → launch grid. (It was one non-scrolling screen in the first build; that held only while there was nothing below the fold to say.) Inner pages scroll and clear the fixed header by 84px.

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
- `guidelines/` — 13 specimen cards → Design System tab, grouped **Colors, Type, Brand, Shape, Spacing**
- `assets/` — `logo-wordmark.png`, the theme's `icon-*.svg` and `alpine-ph-*` / `alpine-cut-*` placeholder art, `reference/` (the original brand board)
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

1. ~~**Which logo treatment is official?**~~ **Resolved: in between.** Confirmed against `Artboard 8.pdf`. The asset already in `assets/logo-wordmark.png` (pulled from Shopify Files) matches this treatment, so no asset swap was needed.
2. **Font files.** DX Burst and Aktiv Grotesk Semibold are substituted (Caveat Brush, Archivo 600). Send the licensed `.woff2` and this becomes exact.
3. ~~**Exact hexes for Sage, Khaki and Flare.**~~ **Resolved: current values confirmed.** The board only prints hexes for Bone, Mist and Olive; those three are exact vector-fill extractions from `Artboard 9.pdf`. Sage, Khaki and Flare have no printed hex, so they were re-derived by sampling the board's swatch fills directly and correcting for the PDF's rendering gamma (fit against the three known values, γ≈1.24) — this confirms `--sage:#b9bea3`, `--khaki:#828059`, `--flare:#ede270` to within 1 hex step. No change made.
4. **Destructive and status colours.** The palette has no red. Destructive currently reads as khaki and submission statuses use flare/sage/khaki. Still awaiting the client's call — not confirmed, no off-palette red approved yet.
5. **Photography.** Both kits use the theme's grey placeholder art; real ride photos will change the character of the hero and route cards considerably.
6. ~~**Rolling this into the theme.**~~ **Done.** Prepared as a PR-ready diff on branch `brand-board-value-swap` in `jhbush01/Bush-Riding-Theme` — see `github.md` for the sync log and PR link.
