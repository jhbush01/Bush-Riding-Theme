repo: jhbush01/Bush-Riding-Theme
branch: main
path:

Live surfaces this design system is derived from:
- Shopify storefront theme (this repo) — the "alp" skin, deployed to bushriding.cc
- Bush Map app (`/map` in this repo) — deployed to map.bushriding.cc

Shopify re-uploads the theme when commits land on `main`, so this repo is the source of truth. Sync this design system when the theme's CSS, sections or the map app change.

## Last sync
date: 2026-08-16T09:30:00Z
commit:
### Updated in this project
- Palette and type now come from the BRAND BOARD, not the theme: six colours (bone/sage/mist/khaki/olive/flare) and DX Burst → Aktiv Grotesk Semibold → Inter. The theme's navy, lavender haze, citrus, terracotta and plum are retired.
- Token VARIABLE NAMES from `assets/alpine.css` (--alp-*) and `map/styles/app.css` (.brm scope) are preserved, so applying this to the live theme is a value swap, not a rewrite.
- Component set re-cut to the theme's real primitives (Chip, Wordmark, NavLink… ; Bush Map Button, FilterPill, Toggle…).
- Two UI kits added: storefront home (alp- sections) and Bush Map routes screen.
- Real brush wordmark pulled from Shopify Files into assets/logo-wordmark.png.

## Screen map
| Screen / artifact | Built from |
| --- | --- |
| Storefront tokens (tokens/storefront.css) | assets/alpine.css `:root` |
| Map tokens (tokens/map.css) | map/styles/app.css `:root` + card tokens |
| components/storefront/* | assets/alpine.css (.alp-chip, .alp-nav-link, .alp-card, .alp-text-link) + sections/alpine-header.liquid |
| components/map/* | map/styles/app.css (.button, .cat, .toggle, .field-input, .filter__select, .legend, .subs-item__badge, .brm-toast, .result, .map-nav) |
| ui_kits/storefront/index.html | sections/alpine-header.liquid, alpine-hero/manifesto/collection/statement/story/footer + assets/alpine.css |
| ui_kits/map/index.html | map/index.html + map/styles/app.css |
| assets/logo-wordmark.png | Shopify Files (IMG_0888-removebg-preview.png), also uploads/IMG_0888.jpeg |

## Sync history
- **2026-08-25** — Prepared the "value swap, not rewrite" from open question #6 as a PR: [`jhbush01/Bush-Riding-Theme#28`](https://github.com/jhbush01/Bush-Riding-Theme/pull/28), branch `brand-board-value-swap` → `main`. Corrects `assets/alpine.css` and `map/styles/app.css` (plus `map/src/map.js` and `scripts/generate-route-pages.js`, which duplicate the same colour constants) from an earlier gamma-shifted first pass to the exact board hexes, retires the remaining terracotta/plum literals, and moves headings from Archivo 700 to the board's Semibold (600). Confirmed against the boards directly: sage/khaki/flare hexes verified by sampling the PDF's vector fills and correcting for its rendering gamma (see readme.md open question #3); logo treatment confirmed as "in between," already matching the live `assets/logo-wordmark.png`. Destructive colour and the licensed font files are still open — see readme.md.
