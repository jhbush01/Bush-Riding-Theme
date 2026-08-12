# Static artwork

Shared imagery served from `/public/`:

- `og-card.jpg`, `og-image.png`, `og-bg.jpg` — social share cards.
- `apple-touch-icon.png` — home-screen icon.

Route hero photos are **not** kept here any more. They are uploaded with a
route through the community worker and live in R2, and the map reads them from
each route's `photo_url`. A bare filename in an event's `hero_image` still
resolves to this folder (see `resolveHero` in `src/map.js`), which is the only
reason to add an image here.

The route card hides its photo block gracefully when a file is missing, so the
map works with none of these in place.
