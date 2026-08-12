# Static artwork

Shared imagery served from `/public/`:

- `og-card.jpg`, `og-image.png`, `og-bg.jpg` — social share cards.
- `apple-touch-icon.png` — 180px iOS home-screen icon.
- `icon-512.png` — 512px square, the upload source for the Shopify theme
  favicon (Online Store → Customize → Theme settings → Favicon).

Both PNGs are GENERATED from `map/favicon.svg` by `scripts/build-icons.js` —
edit the SVG and re-run it, don't touch them by hand. They are square-cornered
and opaque on purpose: iOS applies its own squircle mask, and a pre-rounded PNG
leaves transparent corners that composite against black.

Route hero photos are **not** kept here any more. They are uploaded with a
route through the community worker and live in R2, and the map reads them from
each route's `photo_url`. A bare filename in an event's `hero_image` still
resolves to this folder (see `resolveHero` in `src/map.js`), which is the only
reason to add an image here.

The route card hides its photo block gracefully when a file is missing, so the
map works with none of these in place.
