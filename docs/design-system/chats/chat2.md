# Bush riding branding guidelines

_Started 2026-08-25 12:04 UTC_

---

## User

Continuing from "Bush Riding Theme repository".

## Assistant

We were rebuilding the Bush Riding design system from scratch against two real sources: your live Shopify theme repo and the brand palette board you provided. The system needed to reflect the exact palette (bone, sage, mist, khaki, olive, flare) and type stack (CyberBrush display, Aktiv Grotesk headings, Inter body) from the board, not the theme's existing colours and fonts.

We decided early to keep your existing token variable names (`--alp-*` for storefront, `--cream`/`--olive`/`--plum` for the map) so that pushing changes back to the live theme would be a simple value swap, not a structural rewrite. We also pulled the real logo — a hand-painted brush wordmark PNG — into `assets/logo-wordmark.png` rather than attempting to recreate it in type.

The system is now complete and compiled:
- **Tokens:** six-colour palette + three-tier type scale, all Google Fonts except CyberBrush and Aktiv Grotesk (currently substituted with Rock Salt and Archivo 700).
- **Components:** 10 primitives for the storefront (Chip, Wordmark, NavLink, ProductCard, TextLink) and 10 for the Bush Map (Button, FilterPill, Toggle, Field, Select, Legend, StatusBadge, Toast, ResultItem, MapPill).
- **Foundation cards:** 10 specimen cards covering colours, type, spacing, and brand.
- **UI kits:** storefront home page and map routes screen, both faithful recreations using the board's palette and type.

The verifier flagged a readability issue — the cream wordmark was faint against pale hero art — which we fixed by adding a local scrim behind the pinned header band. Real photographs (which are darker) won't need it, but it holds in preview.

Open items: (1) licensed `.woff2` files for CyberBrush and Aktiv Grotesk to replace the substitutes; (2) your call on a destructive/error colour (the palette has no red); (3) whether to prepare the theme change as a PR-ready diff when you're ready.

Files involved: `styles.css`, `tokens/` (colors.css, typography.css, spacing.css, shape.css, motion.css, base.css, storefront.css, map.css, fonts.css), `components/storefront/` and `components/map/`, `guidelines/` (10 cards), `ui_kits/storefront/` and `ui_kits/map/`, `assets/logo-wordmark.png`, `github.md`, `readme.md`.

## User

Attached are the official logo concepts, colour palette with hex codes and fonts for bush riding. make the appropriate changes to teh design system please.

## Assistant

I'll read the three PDFs to get the official specs.

_[tool: read_skill_prompt]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: sleep]_

_[tool: save_screenshot]_

_[tool: multi_screenshot]_

_[tool: eval_js]_

_[tool: read_file]_

Confirmed the real specs. Palette hexes were slightly off in my system (gamma-shifted samples); the PDF gives the true values. Display font is **DX Burst**, not CyberBrush.

_[tool: grep]_

_[tool: read_file]_

_[tool: read_file]_

Now applying the corrections across all source files.

_[tool: run_script]_

Now the font import and the docs that describe the type stack and logo concepts.

_[tool: write_file]_

_[tool: str_replace_edit]_

_[tool: read_file]_

_[tool: list_files]_

_[tool: read_file]_

Extracting the three logo concepts as real assets from the board.

_[tool: write_file]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: eval_js]_

_[tool: get_webview_logs]_

_[tool: eval_js]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: eval_js]_

Extraction is hanging; the roughness variants are a production detail I'll document rather than reproduce. Finishing the docs.

_[tool: delete_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: run_script]_

Now a card for the three logo concepts, and the palette card needs the hex labels corrected.

_[tool: read_file]_

_[tool: run_script]_

_[tool: write_file]_

Now the readme.

_[tool: read_file]_

_[tool: run_script]_

_[tool: check_design_system]_

_[tool: grep]_

_[tool: grep]_

_[tool: ready_for_verification]_

Updated the system to the official boards:

**Palette** — the printed hexes replaced my gamma-shifted samples: bone `#EDECC5`, mist `#A7B8B4`, olive `#4C4B3B`. Sage, khaki and flare are colour-matched from the same board (no printed hex) — `#B9BEA3`, `#828059`, `#EDE270`. Olive on bone is now 7.3:1. Corrected everywhere, including derived tints and rgba shades.

**Type** — display font is **DX Burst**, not CyberBrush; substitute swapped from Rock Salt to Caveat Brush, a much closer heavy brush script. Headings are Aktiv Grotesk **Semibold** (was Bold), so `--weight-heading:600` and the substitute is Archivo 600. Inter unchanged.

**Logo** — added a "Logo concepts" card recording the three brush-edge treatments (rough / in between / smooth). All three cells show the existing PNG as a stand-in; I couldn't extract the variants from the PDF.

Three things I need from you: which treatment is official, exact hexes for sage/khaki/flare, and the licensed DX Burst / Aktiv Grotesk `.woff2` files.

## User

Found issues — fixing…

## Assistant

Retrying the extraction with the module shape that worked.

_[tool: write_file]_

_[tool: show_html]_

_[tool: sleep]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: eval_js]_

_[tool: sleep]_

_[tool: eval_js]_

Extraction hangs reliably at document load. Taking the sanctioned fallback: no implied comparison, legible copy.

_[tool: write_file]_

_[tool: delete_file]_

_[tool: ready_for_verification]_

The three-up comparison couldn't be built — PDF rendering hung on every retry, so I can't crop the variants out of Artboard 8. The card now shows one mark and states plainly, at body size in olive, that the board offers three edge treatments and asks which is official. No implied comparison.

