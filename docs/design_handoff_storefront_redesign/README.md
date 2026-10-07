# Handoff: Bush Riding storefront redesign (desktop + mobile)

Target repo: `jhbush01/Bush-Riding-Theme` (Shopify theme, Dawn-based, `alp-*` skin). Read the repo's `CLAUDE.md` first — brand voice, branch workflow and the "editor-owned files" rules apply.

## Overview
A photography- and product-led redesign of the Shopify storefront. Clean lines, hairline borders, symmetry, one accent per screen. Today there is **one product** (Bush Riding Shorts, $260 AUD); T-Shirts and Caps are "Next drop". Customers must reach checkout in **3 taps or fewer** from any product card.

Desktop and mobile are **deliberately different layouts** (CLAUDE.md rule 6). Build both; switch at the theme's existing mobile breakpoint (749px in Dawn — keep it).

## About the design files
The `.dc.html` files here are **design references built in HTML**, not production code. Recreate them in the theme's own environment: Liquid sections/snippets, `assets/alpine.css` (prefix everything `alp-`), and `assets/alpine.js`. Do not ship the HTML or its inline styles. Open the files in a browser to inspect (they need the sibling `support.js`, `_ds/`, `assets/`). Grey "drop an image" boxes are photo slots — in Liquid they become `image_url | image_tag` from section settings (CLAUDE.md rule 7: never CSS background-image).

- `Hifi Desktop.dc.html` — 11 screens at 1280px (D01–D11). **Primary reference.**
- `Hifi Mobile.dc.html` — 14 screens at 402px (M01–M12 + M06a/M06b). **Primary reference.** Top of the file has the 3-tap checkout diagram.
- `Wireframes *.dc.html` — earlier exploration; only for context on why choices were made.

## Fidelity
**High-fidelity** for layout, colour, type, spacing, copy and interactions. **Not final** for: photography (placeholders), ride dates/names/recaps (sample copy), location + weather (static placeholder).

## Design tokens
Use the existing `--alp-*` variables; the values below are what they must resolve to (brand board — non-negotiable).

| Token | Hex | Use |
|---|---|---|
| bone | `#edecc5` | page background, header, sheets |
| paper | `#ffffff` | input fields, chips on photos, ride cards |
| card ground | `#eceada` | product-photo ground, Next-drop tiles |
| sage | `#b8bca1` | muted text on olive |
| mist | `#a7b8b4` | map/route image ground |
| khaki | `#817f57` | muted/secondary text, "soon", stats |
| olive | `#4c4b3b` | all text, primary buttons, selected size, hairline base |
| flare | `#ece26a` | **one accent per screen**: Checkout, Buy now, "Next drop" badge, next ride date |
| line | `rgba(76,75,59,.24)` | every hairline/divider |
| scrim | `rgba(76,75,59,.38)` hero, `.5` behind sheets/drawers | |

Type: headings `Archivo 600` (stand-in for Aktiv Grotesk Semibold), body `Inter 400/500/600`. `DX Burst Smooth` only for the 2-letter fabric codes in Filters. The logo is SVG artwork (`assets/wordmark-olive.svg`, `wordmark-bone.svg`) sized by height — never typeset it.

Radius: chips and buttons `3px`; mobile bottom sheets `16px 16px 0 0`; inputs and size tiles `0`. Shadows: none on the storefront.

Type scale used (desktop / mobile): page title 40/28–30, product name 34/30, section head 18–22/17–22, nav 16/14 Archivo 600, body 15–17/14–16, captions 13–14/13, overline 12/11 Inter 600 letter-spacing .12em uppercase.

## Global chrome
**Desktop header** (84px, bone, bottom hairline, padding 0 40px, gap 44px, Archivo 600 16px): wordmark 26px tall · Shop · Bush Map · Rides · (spacer) · `HH:MM:SS AEST · 24° cloud` (Inter 13px khaki) · Search · Cart (n). Active page = underline, offset 5px.
**Mobile header** (56px, padding 0 18px, gap 18px, Archivo 600 14px): wordmark 19px · spacer · Search · Cart (n) · hamburger (2px stroke, round caps). Menu open → icon becomes ×.
**Clock**: live, `Australia/Brisbane`, updates every second. Weather is a placeholder — wire to a weather API or remove.
**Footer** (same on every page; desktop D11, mobile M12): Newsletter ("We send the occasional route, nothing else.", email + Subscribe), Country/Region `AU / (AUD) ▾` (Shopify Markets), 4 link columns HELP / BUSH RIDING / CONTACT / LEGAL (4-up desktop, 2×2 mobile), full-width olive wordmark, `© Bush Riding™ 2026` row.

## Screens
### Desktop
- **D01 Home** — 720px full-bleed hero (video or image) + scrim, bone wordmark 150px tall centred, "Made for the detour." below. Then 2-up 640px: lifestyle | product with name + price chips bottom-left. 4-up 3:4 row: Shorts (Quick add on hover), Shorts rear, T-Shirts Next drop, Caps Next drop. 2-up 560px: "Ride with us" → Rides, "Get the route. Join the bush." → Bush Map. Footer.
- **D02 Shop landing** — grid `320px 1fr 1fr`, 800px tall. Left: category list (Archivo 600 20px; T-Shirts/Caps khaki + "· next drop"), bottom-aligned clock block + newsletter. Right: product image, lifestyle image.
- **D03 Collection** — category bar 64px (View all / New in / Bottoms / T-Shirts soon / Caps soon … "1 product"). Grid `1fr 1fr 2fr`, 12px gap: Shorts card, T-Shirts Next drop, lifestyle tile spanning 2 rows, Caps Next drop, olive "Hear about the next drop first." email tile. **Filters/Sort hidden until 6+ products.**
- **D04 Filters** (6+ products only) — drops below the category bar: Category / Size (3×2) / Fabric & features (code tiles LW, MW, ZP). "Show N result(s)" (live count) + Cancel.
- **D05 Product** — grid `2fr 1fr`. Left: 2×2 3:4 images (Front, Back, On the bike, Rear zip pocket). Right column sticky: overline BOTTOMS, "Bush Riding Shorts" 34px, "$260 AUD", size row XS–XXL (sold-out = line-through khaki), **Add to cart · {size}** (olive) + **Buy now** (flare) side by side, description, accordions (Fabric & features open by default; Fit; Care; Shipping & returns). Below: "Coming in the next drop" T-Shirts / Caps tiles with Notify me.
- **D06 Search** — field under header ("Search shorts, routes and rides") + Search. "Most popular" 4-up: product, 2 routes (Route tag), 1 ride (flare Ride tag).
- **D07 Cart drawer** — 640px from right, page dimmed. Line item (thumb 132×176, size, qty stepper, Remove), Subtotal, "Shipping and taxes calculated at checkout · AUD", flare **Checkout**. Opens automatically after any add.
- **D08 Bush Map menu** — hover/click "Bush Map ▾" opens a 460px panel: mini-map left; right "BUSH MAP™", tagline, NEAR YOU list (route · km · m), Open the map (olive) + Submit a route. Page dimmed below.
- **D09 Rides** — "Upcoming rides" + 3 cards (photo 260px, date badge — next ride flare, title, stats, RSVP chip). "Recaps": alternating 520px photo/text rows.
- **D10 About** — 720px split photo | text, "Made for the detour." 56px statement, 3-up photos.
- **D11 Footer** — see Global chrome.

### Mobile
- **M01 Menu** — drop-down sheet under the header, page dimmed. Shop (expanded: View all, Bottoms, T-Shirts/Caps next drop), Bush Map →, Rides →, About →; clock + location/weather left, currency right.
- **M02 Home** — 764px hero, "The shorts" single product card (500px) with **Quick add +** chip bottom-right, lifestyle 480px, Next drop band, Rides | Bush Map 2-up, full footer.
- **M03 Shop landing** — rows: Bottoms ("1 style →"), T-Shirts & Caps ("Next drop"); product card with Quick add; one lifestyle image.
- **M04 Collection** — scrollable category row, "1 product", product card with Quick add, full-width lifestyle every 2 products, Next drop band.
- **M05 Filters** (6+ products only) — bottom sheet, accordions (Size open), Clear + "Show N result(s)".
- **M06 Product** — stacked full-width images (520px each), then overline, name, price, description, accordions. **Sticky bottom bar**: "Size · M" + Size guide, 6 size tiles, Add to cart (outline) + **Buy now · $260** (flare).
- **M06a Quick add** — bottom sheet from any card: thumb, "Choose a size to add", 3×2 size buttons. **Tapping a size adds it** (no separate Add button).
- **M06b Added** — sheet: item + size, Subtotal, View cart + flare **Checkout**, Keep shopping.
- **M07 Search** — field + keyboard, chips All / Products n / Routes n / Rides n, grouped results PRODUCTS / ROUTES · BUSH MAP™ / RIDES.
- **M08 Cart** — full screen, sticky Subtotal + Checkout.
- **M09 Bush Map** — landing page: route photo cards (region tag, name, km · m), Submit a route, sticky Open the map.
- **M10 Rides**, **M11 About**, **M12 Footer** — stacked versions of desktop.

## Interactions & behaviour
**3-tap checkout (required):**
1. Card → Quick add → tap size (adds to cart, opens Added sheet / desktop cart drawer) → Checkout.
2. Card → product page → pick size → Buy now (Shopify dynamic checkout, `{{ form | payment_button }}`) → checkout.
- Size is required; Add to cart / Buy now show the chosen size. If no size is picked, tapping them scrolls/highlights the size row.
- Sold-out sizes: line-through, khaki, not selectable.
- Cart count in header updates after add (Dawn's `cart-drawer` / `cart-notification` sections).
- Hover (desktop): chip hover inverts to olive fill / white text; Quick add strip appears on card hover. Focus ring 2px flare everywhere.
- Motion: sheets/drawers slide 0.25s ease-out; existing scroll-reveal (`translateY(24px)`, 0.55s ease-out) is fine to keep. Honour `prefers-reduced-motion`.
- Next drop / Notify me: decide provider (Shopify Forms, Klaviyo, or newsletter list tag).
- Filters/Sort: render only when collection product count ≥ 6 (Shopify Search & Discovery filters).
- Bush Map menu and Rides: routes/events can come from `map-api.bushriding.cc`; "Open the map" → `https://map.bushriding.cc`.

## State
Selected size (product + quick add); cart contents/count; open sheet/drawer (menu, quick add, added, cart, filters); live clock.

## Real content
- Product: **Bush Riding Shorts — $260 AUD**. Fabric & features (verbatim): "Ultra-lightweight, durable nylon outer shell" · "Moisture-wicking nylon inner lining" · "Rear zipper pocket".
- Routes (from `map/routes/qld/brisbane-metro`): Ferny Grove to Wulkuraka — 76 km · 2,140 m; Goat Track Loop — 46 km · 890 m.
- Brand lines: "Made for the detour." · "Explore more with our curated gravel routes and events" · "Get the route. Join the bush." · "We send the occasional route, nothing else." · "Ride with us. Share your stories. Let's explore together."
- Sample (replace): ride dates/titles, recap copy, About paragraphs, location "Gold Coast, QLD", weather.

## Assets
- `assets/wordmark-olive.svg`, `assets/wordmark-bone.svg` — from the design system (`assets/logo/`).
- `assets/hero-watercolour.jpg` — copied from the repo's `map/public/og-bg.jpg` (Hans Heysen watercolour). **Confirm usage rights before using on the store**, or replace with a hero video.
- All other imagery: placeholders — no ride/product photography exists in the repo yet.
- Icons: inline SVG, 2px stroke, round caps, `currentColor` (hamburger, close). No icon library, no emoji.
