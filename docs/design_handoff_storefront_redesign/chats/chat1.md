# Bush riding website wireframes

_Started 2026-10-06 22:33 UTC_

---

## User

Wireframe the screens for the bush riding website using the attached images for reference, we will build the desktop version first and then use this to build the mobile optimised version. It is photography and product focused with clean lines and symmetry.

## User

Wireframe the screens for the bush riding website using the attached images for reference, we will build the desktop version first and then use this to build the mobile optimised version. It is photography and product focused with clean lines and symmetry.

## Assistant

_[tool: list_files]_

_[tool: github_get_tree]_

_[tool: github_read_files]_

_[tool: list_files]_

_[tool: github_get_tree]_

_[tool: ask_user]_

I've sent a short form. Once you answer, I'll sketch the desktop wireframes. It covers which screens to include, how many options to sketch per screen, the nav and category names, the home hero, and which details from the RCOS references to keep.

## User

Answered — Asked for follow-up questions; screens: Home, Shop / collection grid, Shop landing (category list + feature images), Filters panel, Product page, Search overlay, Cart drawer, Bush Map entry point, Store / about, Footer + newsletter; options_per: 2; divergence: Mix: one faithful, others exploring; nav: Shop, Bush Map, Rides / events, Search, Cart; categories: Bottoms is the only product that will be available for a while. But we are looking to add T-shirts, caps in the next drop.; home_hero: Full-bleed video/photo with large logo (like RCOS); map_link: Top nav item; extras: Local ti…

## Assistant



## Assistant

_[tool: ask_user]_

I added three follow-up questions to the form: how the shop should look with only Bottoms live, what goes on Rides / events, and what the store / about page is. I'll start the wireframes once you answer.

## User

Answered — small_catalogue: Show the full category nav anyway, empty ones say 'Coming in the next drop'; rides_page: Both: upcoming at top, recaps below; store_about: About the brand (no physical store)

## Assistant

_[tool: list_files]_

_[tool: list_files]_

_[tool: copy_files]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

_[tool: write_file]_

I've wireframed 11 desktop screens in **Wireframes Desktop.dc.html**, two options each (`1a`–`1v`). It's going through a background check now.

- **Option a** on each screen follows the RCOS references closely.
- **Option b** is symmetric: logo centred, nav split either side.
- **Rides / events** is included because it's in your nav, though it wasn't on your screen list.
- **T-Shirts and Caps** show everywhere, muted and labelled "next drop".

Product names, prices, fabric codes and route names are placeholders, so I'll need the real product, fabric and route details.

Next, pick an option for each screen (mixing a and b is fine) and I'll build the mobile versions from your picks.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I moved the numbered note markers in `1a`, `1e`, `1g`, `1i` and `1j` into empty space so they no longer cover any labels. The file is going through the background check again.

## User

Found issues — fixing…

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I moved the rest of the note markers that were covering text (in `1c`, `1f`, `1g`, `1i`, `1l`, `1n`, `1q`, `1r` and `1t`) into empty space. The file is going through the background check again.

## User

Found issues — fixing…

## Assistant

Each dot was placed with hand-picked coordinates, so a few landed on text. The two that remain go on photo areas, which have no text.

_[tool: run_script]_

_[tool: ready_for_verification]_

I moved the last two note markers that were covering text (in `1s` and `1v`) onto photo areas, so no labels are covered now. I skipped the full background check on this small fix; the page loads with no errors.

The automatic layout check still flags one overlap next to "Shop bottoms" in `1b`. That marker sits under the button, not on top of any text, so I left it.

## User

Let's go through and choose, screen by screen. I like 1A, 1C, 1E, 1G, 1I, 1K, 1N, 1P, 1R, 1S, 1U but I like the big logo in 1V. Let's confirm this as the desktop website and ask me any questions before we move to the mobile

## Assistant



## Assistant

_[tool: dc_html_str_replace]_

_[tool: ask_user]_

I've locked in your picks as the desktop set and listed them at the top of the file. The footer is now its own screen, `2a`: the `1u` layout with the large wordmark from `1v` running the full width, above the copyright line.

I've sent a short form with the mobile questions: the header and nav, product grid columns, the product page, how the Bush Map menu works on a phone, where local time and weather go, and how many options to sketch per screen. I'll start the mobile wireframes once you answer.

## User

Answered — Asked for follow-up questions; mobile_nav: Logo left, Search + Cart + menu right; mobile_grid: 1 column; lifestyle_tile: Full-width between every 2 rows; pdp: Stacked images, details below, sticky Add to cart bar; map_menu: Bush Map gets its own small landing page; time_weather: Inside the menu overlay; options_mobile: 2 per screen

## Assistant



## Assistant

_[tool: ask_user]_

_[tool: ask_user]_

I added four more questions to the form: how the menu opens, how filters work on a phone, the home hero height, and whether to show the screens in an iPhone frame or a plain 390px frame. I'll start the mobile wireframes once you answer.

## User

Answered — menu_style: Drop-down sheet under the header; mobile_filters: Bottom sheet with accordions; home_hero_mobile: Full-height hero, same as desktop; frame: iPhone frame

## Assistant

_[tool: copy_starter_component]_

_[tool: grep]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

I've added the mobile wireframes in a new file, **Wireframes Mobile.dc.html**, with 12 screens shown in iPhone frames, two options each (`3a`–`3x`). It's going through a background check now. Each phone scrolls on its own to show the full page.

- **New screen:** the drop-down menu sheet (`3a`, `3b`) comes first. It holds the local time, weather and currency.
- **Option a** adapts your desktop pick directly. **Option b** tries one alternative, such as a swipeable product row on Home (`3d`) or Filters and Sort fixed at the bottom of the collection (`3h`).
- **Layout rules from your answers:** one-column product grids with a lifestyle photo every two rows, filters in a bottom sheet, and Bush Map as its own small landing page (`3q`, `3r`).

Pick an option per screen, like you did for desktop, and I'll lock in the mobile set.

## User

3a, 3d, 3e, 3g, 3i, 3k, 3m but group the search results like 3n, 3o, 3r, 3s, 3u, 3x

## Assistant

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

I've locked in your mobile picks and listed them at the top of **Wireframes Mobile.dc.html**, under "Confirmed mobile set".

Search is now its own screen, `4a`. It keeps the search field and keyboard from `3m`, and once you type, results split into Products, Routes and Rides with filter chips, as in `3n`.

Both the desktop and mobile sets are now confirmed. From here I could turn them into a clickable prototype, or start the hi-fi visual design.

## User

I want to see it in hifi with images before I send this to the repo

## Assistant



## Assistant

_[tool: read_skill_prompt]_

_[tool: ask_user]_

I can't generate photos, so I've sent a short form before starting the hi-fi pass. It asks for any ride and product photos you have (otherwise I'll leave drag-and-drop image slots), which screens to do first, and whether you want a static board or a clickable prototype. Real product names, prices and fabric details are optional but will make it closer to final. I'll start once you answer.

## User

Answered — photo_fallback: Pull images from the live Shopify store / repo if any; scope: Desktop: all 11 confirmed screens, Mobile: all 12 confirmed screens; format: Static board of screens (like the wireframes); products: the only product I have now are the bush riding shorts $260; fabric: ultra-lightweight, durable nylon outer shell
moisture-wicking nylon inner lining
rear zipper pocket

## Assistant

_[tool: github_get_tree]_

_[tool: github_copy_files]_

_[tool: web_search]_

_[tool: view_image]_

_[tool: view_image]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: copy_starter_component]_

_[tool: read_file]_

_[tool: github_get_tree]_

_[tool: github_search_code]_

_[tool: github_search_code]_

_[tool: copy_files]_

_[tool: dc_write]_

_[tool: show_html]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

_[tool: write_file]_

I've built the confirmed screens in hi-fi: **Hifi Desktop.dc.html** (11 screens at 1280px) and **Hifi Mobile.dc.html** (12 screens in iPhone frames). Desktop is open now and going through a background check; mobile has had no checks yet, not even a load.

**About the images:** the repo has no ride or product photos. The only usable picture is the watercolour from the Bush Map share image, which I've put in the home hero. Every other picture is an empty drop slot. Drag a photo onto any slot and it stays there.

**Content:**
- **Product:** the Bush Riding Shorts at $260, with your three fabric points written word for word on the product page and in filters.
- **Next drop:** T-Shirts and Caps show as "Next drop" with Notify me.
- **Routes:** Ferny Grove to Wulkuraka (76 km · 2,140 m) and Goat Track Loop (46 km · 890 m), taken from the Bush Map in the repo.

**Placeholders and decisions to check:**
- **Sample copy:** ride dates, ride names, recap titles and the About text are written in the brand voice. Replace them with real content.
- **Colour filter:** I dropped it because there's only one colourway. Filters are size, category and fabric.
- **Clock:** time is live, set to Brisbane. The location (Gold Coast) and the 24° cloud weather are fixed placeholders.
- **Watercolour hero:** it's a Hans Heysen painting. It's already in your repo as the share image, but confirm you're cleared to use it on the store, or swap in your own video.

## User

Found issues — fixing…

## Assistant

_[tool: snip]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I've fixed the layouts where photo slots were stretching their columns. That was squeezing the product details panel, overflowing the shop landing, and overlapping text on the About page. Columns now stay at their set widths in both hi-fi files. Desktop is going through the background check again; mobile has the same fix but hasn't been checked yet.

## User

Can you do a check over the mobile hifi pages to ensure the design is seamless and cohesive. making sure everything earns it's place. especially the shop landing, collection and product pages. the customers needs to be able to get to checkout in 3 clicks.

## Assistant

_[tool: read_file]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I've gone over the mobile hi-fi pages, and checkout is now three taps from any product card. The file is going through a background check.

**Three taps to checkout** (shown as a strip at the top of the board):
- **Quick add:** tap Quick add +, tap a size (that adds it), then Checkout. I added two screens for this, M06a (choose a size) and M06b (added, with Checkout).
- **Product page:** open the product, pick a size in the sticky bar, then Buy now, which goes straight to checkout. This relies on Shopify's built-in "Buy it now" button.

**What I cut or merged:**
- **Home and Shop landing:** the swipe row only had one product in it, so it's now a single shorts card with Quick add. Shop landing lost the "View all" row, which went to the same place as Bottoms, and the newsletter, which is already in the footer.
- **Collection:** I removed Filters, Sort and "New in", since they don't do anything with one product. The page shows "1 product" instead. T-Shirts and Caps now share one "Next drop" band.
- **Product page:** size is picked in one place now, the sticky bar, instead of twice. I removed the "Next drop" band so nothing competes with buying.
- **Cart:** removed the "Notify me" row, so nothing sits between the item and Checkout.

**Making it consistent:**
- Home now uses the same full footer as every other page.
- Primary buttons use the same 3px corner as the chips.
- Search shows a count on the Products chip, like the others.

The Filters screen (M05) is still on the board, labelled to switch on once there are 6 or more products.

The desktop set doesn't have these changes yet. Do you want me to apply the same three-tap flow there?

## User

Desktop is different, only change it if you think the same thing will work functionally on desktop. otherwise what do I need to do to get the desktop and mobile websites to the bush riding theme repo

## Assistant

_[tool: run_script]_

_[tool: ready_for_verification]_

I made a few functional changes to desktop and left the layout alone. I skipped the full background check on these small edits; the page loads with no errors. Checkout is now two or three clicks:
- **Quick add on hover:** the size row appears on the product photo. Clicking a size adds it and opens the cart drawer, then Checkout.
- **Buy now:** added next to Add to cart on the product page. It goes straight to checkout using Shopify's built-in "Buy it now" button.
- **Collection:** Filters and Sort are removed until there are 6 or more products. The page shows "1 product" instead.

**Getting both sites into the repo**

1. **Settle the open items first.** These are the things the theme build will need:
   - **Photos:** real product and ride photos, or a decision to launch with placeholders.
   - **Hero rights:** confirm you're cleared to use the Heysen watercolour, or supply a hero video.
   - **Rides content:** real ride dates, ride names and recap copy.
   - **Notify me:** whether it goes through a back-in-stock or email app (Klaviyo, Shopify Forms) or the newsletter list.
   - **Weather:** whether to keep the weather readout. It needs a weather API; the clock doesn't.
2. **I package a developer handoff.** I can write up a spec for each screen, mapped to the repo's files (`sections/alpine-*.liquid`, `assets/alpine.css`, `alpine.js`). It would include the design system colour values, desktop and mobile behaviour listed separately, and the checkout flow. Just say "do the handoff".
3. **Build it in Claude Code, working in the repo:**
   - Branch `feature/storefront-redesign` off `develop`, and run `git pull --rebase` first, per your CLAUDE.md.
   - Point Claude Code at the handoff and build section by section.
   - Theme Check runs in CI. Preview with `shopify theme dev`.
   - Merge `develop` → `main` to publish.
4. **What Shopify handles natively:** Buy now (the "Buy it now" button), filters (the Search & Discovery app, once you have more products), the cart drawer (Dawn already has one), and currency (Shopify Markets). The Bush Map menu and Rides can pull routes and events from your existing map API.

## User

i need to build it in claude code

## Assistant

_[tool: read_skill_prompt]_

_[tool: copy_files]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: present_fs_item_for_download]_

The handoff package for Claude Code is ready to download above.

1. Unzip it into the repo at `docs/design_handoff_storefront_redesign/`. The theme check skips `docs/` and Shopify never uploads it.
2. Open Claude Code in the repo and paste in the contents of `CLAUDE_CODE_PROMPT.md`.
3. It will show you which theme files each screen maps to, and a plan, before it writes any code.

Inside the package:
- **`README.md`:** the full spec, covering colours, type, every screen, the three-tap checkout, real content and open items.
- **The design files:** both hi-fi files and the wireframes, which open in a browser for reference.

Before you launch, you still need to supply photos, confirm the rights to the watercolour, and replace the sample ride copy.

Do you want screenshots of each screen added to the package?

