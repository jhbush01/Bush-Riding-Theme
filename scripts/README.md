# SEO route page generator

`generate-route-pages.js` produces static, crawlable, JS-free HTML pages for
every **published** route, plus region aggregation pages, so search engines and
AI crawlers can read route content without executing JavaScript.

## Run it

```bash
npm run build:seo
```

Output is written into `map/` under:

```
map/routes/index.html                                  → /routes/
map/routes/{state}/index.html                          → /routes/qld/
map/routes/{state}/{region}/index.html                 → /routes/qld/southern-downs/
map/routes/{state}/{region}/{route-id}/index.html      → /routes/qld/southern-downs/{id}
```

`map/routes/` is git-ignored — it's build output, not source (see below).

## Data source (single source of truth)

The generator resolves routes in this order:

1. `BRM_ROUTES_FILE=/path/to/routes.geojson` — read a local file (used for tests).
2. Otherwise **fetch `BRM_ROUTES_API`** (default `https://api.bushridingmap.com/routes`) —
   the live published community routes. This keeps current and future routes
   structured identically with no manual step.
3. If the fetch fails, fall back to the committed `map/data/routes.geojson` so a
   deploy never breaks.

Only features with `status: "published"` are generated. Drafts are skipped.

## Deploy (required one-time Cloudflare Pages setting)

Pages regenerates the route pages on every deploy, from live data:

- **Build command:** `npm run build:seo`
- **Build output directory:** `map`

Cloudflare's build environment can reach the public route API, so each deploy
picks up any newly-approved routes automatically. (Optional: have the community
Worker ping a Pages **Deploy Hook** on approval so pages refresh immediately.)

If you'd rather commit the HTML instead of generating at deploy: remove
`map/routes/` from `.gitignore`, run `npm run build:seo` locally (you have API
access), and commit the generated files.
