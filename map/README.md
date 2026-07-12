# Bush Riding — Interactive Routes Map (v1)

A public, no-login interactive map of curated gravel routes (MapLibre GL JS).
Visitors browse and filter; downloading a route's GPX captures an email to Klaviyo.
Two optional Cloudflare Workers extend it without touching the public map:
community route **submissions** (`worker/`) and a personal ride **diary**
(`diary-worker/`). Browsing always stays public and login-free.

> **Repo note:** the v1 brief specified a standalone `bush-riding-map` repo. This
> build lives in the `map/` subdirectory of the theme repo because that was the
> only repo available at build time. It is fully self-contained (no Shopify/Liquid
> coupling) and can be lifted into its own repo verbatim — point Cloudflare Pages
> at this folder as the build output directory.

## Layout

```
map/                  # static front-end (Cloudflare Pages)
  index.html          # Landing page (/) — full-bleed hero + "Explore now"
  map.html            # Map app (/map) — MapLibre, filters, detail, gate, diary, config
  submit.html         # Public "Submit a route" form (/submit) -> community worker
  src/
    map.js            # map init, sources/layers, clustering, selection, community merge
    filters.js        # client-side filtering over the GeoJSON
    gate.js           # email-capture modal -> Klaviyo -> blob GPX download
    diary.js          # personal ride diary: auth, ochre layer, ink animation, panels
  styles/
    bush.json / bush-protomaps.json  # basemap styles (OpenFreeMap active; Protomaps spare)
    app.css           # shared UI (Archivo body, Instrument Serif headings) + diary UI
    landing.css / submit.css
  data/routes.geojson # curated routes — single source of truth
  gpx/<id>.gpx        # one track per curated route
  public/<id>.jpg     # hero/landing photos
  favicon.svg, _redirects, _headers

worker/               # community routes Worker (api.bushridingmap.com) — see worker/README.md
diary-worker/         # personal ride diary Worker (diary.bushridingmap.com) — see diary-worker/README.md
```

### System overview
- **Front-end (Pages):** the static `map/` site. Browsing is public, no login.
- **Community worker (`worker/`):** accepts public GPX submissions, moderation at
  `/admin`, serves approved routes the map merges in. `BRM_CONFIG.communityApi`.
- **Diary worker (`diary-worker/`):** authenticated personal ride diary (PBKDF2 +
  JWT). The map's "My Rides" draws your rides in ochre below the community routes.
  `BRM_CONFIG.diaryApi`. Requests are kept preflight-free (token in query) so they
  behave like the community worker's "simple" cross-origin calls.

Two pages, shared assets: `index.html` (`/`) is the landing page and `map.html`
is served at `/map` (Cloudflare Pages clean URLs). `map.html` sets `<base href="/">`
so the shared `src/`, `styles/`, `data/`, etc. resolve from the root. The landing
page's "featured route" links to `/map#<route-id>`, which opens that route on the map.

Tiles (`.pmtiles`) are **not** in the repo — they live in R2/hosted and are
referenced by URL.

## Configuration

Everything per-environment lives in one block in `map.html`:

```js
window.BRM_CONFIG = {
  tilesUrl: "", // only for the self-hosted Protomaps/R2 path (see below)
  klaviyoCompanyId: "REPLACE_COMPANY_ID",
  klaviyoListId: "REPLACE_LIST_ID",
};
```

- **Basemap** — `styles/bush.json` is the active, brand-recoloured style on the
  **OpenMapTiles** schema, served by **OpenFreeMap** (free, no key, whole planet).
  It renders out of the box, no config needed.
- **`tilesUrl`** — only used for the self-hosted path. To serve your own tiles,
  swap `bush.json` for `bush-protomaps.json` (Protomaps v4 schema) and set
  `tilesUrl` to your R2 PMTiles URL, e.g. `https://tiles.bushriding.au/planet.pmtiles`.
  `map.js` injects it as the `pmtiles://` source automatically.
- **`klaviyoCompanyId` / `klaviyoListId`** — match the values the landing page
  uses. The gate POSTs to the client-side subscriptions flow (revision
  `2024-10-15`) and tags profiles `source: routes_map`.

## Local preview

Modules + `fetch` need to be served over HTTP (not `file://`):

```sh
cd map && python3 -m http.server 8080
# open http://localhost:8080
```

## Syncing to the deploy repo (`bush-riding-map`)

The app is developed here in `map/`, but Cloudflare Pages deploys a separate
`bush-riding-map` repo where these files sit at the **root**. To create or update
that repo, from a clone of this repo on the branch with your latest changes:

```sh
map/sync.sh
```

This splits `map/` into a root-level history and pushes it to
`https://github.com/jhbush01/bush-riding-map.git` `main` (pass a different repo
URL as `$1` to override). First run requires the target repo to already exist and
be empty. Cloudflare Pages then auto-redeploys on the push.

## Deployment — Cloudflare Pages

1. New Pages project connected to this repo.
2. Build command: none (static). **Build output / root directory:** `map`.
3. Auto-deploy on push to `main`.

### R2 tiles

1. Create an R2 bucket, upload the world `<name>.pmtiles` (Protomaps v4 build).
2. Expose it via a public URL or custom subdomain; set `tilesUrl` to it.
3. **CORS:** allow the Pages origin (and any custom domain) with `GET` + the
   `Range` header — MapLibre reads tiles via HTTP range requests.

## Data

`data/routes.geojson` is a `FeatureCollection`; each route is one `Feature` whose
geometry is the full `LineString`. The pin is the `marker` coordinate (falls back
to the line's start). Controlled vocab: `terrain_difficulty` ∈
`easy | moderate | hard`; `status` ∈ `published | draft` (drafts are filtered out
client-side). `vetted_by` and `status` exist now so future ambassador/public
submissions slot into the same schema without a migration.

> **Published:** `pomona-weekend-gravel` is a real surveyed track (RideWithGPS
> GPX + hero photo). The three original demo routes (Beerwah, Marburg/Glamorgan
> Vale, Mount Mee) have **fabricated** geometry and are set to `status: "draft"`
> so they're hidden from the live map — flip them back to `published` only after
> replacing their `gpx/*.gpx` and coordinates with surveyed tracks.

### Adding a route

1. Drop the surveyed `gpx/<id>.gpx` in place.
2. Add a `Feature` to `routes.geojson` (LineString geometry + the documented
   properties). Distance/elevation can be computed from the GPX.
3. Optimise the hero photo to ~1200 px / &lt;250 KB and save `public/<id>.jpg`.

## Out of scope for v1

Accounts/auth, public/ambassador submissions + moderation, server-side anything.
