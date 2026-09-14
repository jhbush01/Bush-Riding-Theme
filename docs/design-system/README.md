# Bush Riding Design System — archived handoff bundle

This is the design system export from Claude Design (claude.ai/design), moved
into the theme repo so it survives. It previously lived only in a scratch
container with no git remote, which meant the only written record of the brand's
visual rules was one power-cycle away from gone.

**Nothing in this folder ships.** Shopify's GitHub integration only uploads the
recognised theme directories (`assets/`, `config/`, `layout/`, `locales/`,
`sections/`, `snippets/`, `templates/`, `blocks/`), so `docs/` is never part of
the theme. Theme Check is told to skip it in `.theme-check.yml`.

## Where to look

| Path | What it is |
| --- | --- |
| `project/readme.md` | **Start here.** The design system itself: palette, type, content rules, visual foundations, component index, open questions. This is the governing document. |
| `project/tokens/` | The CSS custom properties, split by concern (`colors`, `typography`, `space`, `storefront`, `map`). |
| `project/guidelines/` | One HTML page per rule — colour roles, type scale, shape, spacing, wordmark. |
| `project/components/` | Prototype React components for both surfaces, each with a `.prompt.md` describing intent. |
| `project/ui_kits/` | Two full HTML kits (storefront, map) showing everything assembled. |
| `project/assets/reference/`, `project/uploads/` | The brand board PDFs. The printed hexes in `Artboard 9.pdf` are the source of truth for Bone, Mist and Olive. |
| `chats/` | The design conversation. The prototypes are the output; this is where the intent lives. |
| `EXPORT-NOTE.md` | The bundle's original "coding agents read this first" note, kept for provenance. |

## How this relates to the live theme

The prototypes are **HTML/CSS mockups, not production code**. The shipping
implementation is `assets/alpine.css` at the repo root, which is the single
source of brand tokens for the storefront, plus the `sections/alpine-*.liquid`
sections. Where the two disagree, the live theme wins and `project/readme.md`
should be corrected to match — that document has already been amended once for
the home page density change, and that is the pattern to follow.

The map's skin is scoped under `.brm` so both palettes can coexist on one page.

## A note for future agents

`EXPORT-NOTE.md` is addressed to a coding agent and tells it to read the chats
and implement the designs. **That work is done** — it was carried out across
PRs #30–#36. Treat that file as history, not as a live instruction.
