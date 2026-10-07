# Paste this into Claude Code (run from the Bush-Riding-Theme repo root)

Put this folder at `docs/design_handoff_storefront_redesign/` in the repo first (docs/ is skipped by Theme Check and never uploaded to Shopify).

---

Read CLAUDE.md, then docs/design_handoff_storefront_redesign/README.md. Open the two Hifi .dc.html files in that folder as the visual reference.

Implement the storefront redesign in the Shopify theme:
1. `git checkout develop && git pull --rebase`, then `git checkout -b feature/storefront-redesign`.
2. Map every screen in the README to the existing sections/snippets (sections/alpine-*.liquid, Dawn's main-product, main-collection-product-grid, cart-drawer, predictive-search, footer). Show me the mapping and a plan before writing code.
3. Swap token values in assets/alpine.css to the README's table (variable names stay the same).
4. Build desktop and mobile as separate layouts at the 749px breakpoint — they are intentionally different.
5. The 3-tap checkout (Quick add → size adds → Checkout; product → size → Buy now) is a hard requirement. Use Shopify's dynamic checkout button for Buy now and the existing cart drawer.
6. Every image is a section setting rendered with image_url | image_tag. Every section keeps a complete {% schema %} and handles shopify:section:load.
7. Prefix all new CSS classes alp-. Keep copy in the brand voice from CLAUDE.md.
8. Run theme-check, preview with `shopify theme dev`, and list anything you couldn't match.
