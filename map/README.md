# Bush Riding — Interactive Routes Map

**map.bushriding.cc** — a public, no-login map of curated gravel routes
(MapLibre GL JS, no build step). Riders browse and filter; downloading a route's
GPX captures an email to Klaviyo. Two Cloudflare Workers extend it without
touching the public map: community route **submissions** (`worker/`) and a
personal ride **diary** (`diary-worker/`). Browsing always stays public and
login-free.

The app lives in `map/` inside the theme repo and is deployed straight from
here — Cloudflare Pages points at this folder as the build output directory.
There is no separate `bush-riding-map` repo.

## Layout

```
map/                    # static front-end (Cloudflare Pages)
  index.html            # the map app, served at / — MapLibre, filters, detail card, gate, diary
  submit.html           # public "Submit a route" form (/submit) -> community worker
  404.html
  src/
    map.js              # map init, sources/layers, clustering, selection, 3D relief, community merge
    filters.js          # client-side filtering over the GeoJSON
    gate.js             # email-capture modal -> Klaviyo -> blob GPX download
    diary.js            # personal ride diary: auth, ochre layer, ink animation, panels
    reviews.js          # route ratings + reviews against the community worker
  styles/
    bush.json           # brand-recoloured basemap style (OpenMapTiles schema)
    app.css             # shared UI (Archivo body, Instrument Serif headings)
    submit.css
  vendor/               # self-hosted MapLibre GL JS — see vendor/README.md
  data/
    routes.geojson      # curated seed; the live set comes from the community worker
    events.geojson      # offline fallback for community bush rides
  routes/**, events/**  # GENERATED SEO pages — see scripts/generate-route-pages.js
  public/               # social card + icon artwork
  favicon.svg, robots.txt, sitemap.xml, _redirects, _headers

functions/              # Cloudflare Pages Functions (repo root)
  _middleware.js        # cache policy for the whole site
  diary-api/[[path]].js # same-origin proxy to the diary worker

worker/                 # community routes Worker (map-api.bushriding.cc) — see worker/README.md
diary-worker/           # personal ride diary Worker (diary.bushriding.cc) — see diary-worker/README.md
```

### System overview
- **Front-end (Pages):** the static `map/` site. Browsing is public, no login.
- **Community worker (`worker/`):** accepts public GPX submissions, moderation at
  `/admin`, serves approved routes the map merges in. `BRM_CONFIG.communityApi`.
- **Diary worker (`diary-worker/`):** authenticated personal ride diary (PBKDF2 +
  JWT). The map's "My Rides" draws your rides in ochre below the community routes.
  Reached same-origin through the `/diary-api` Pages Function, so the browser
  never makes a cross-origin request.

Route pages under `routes/**` are **generated** by `npm run build:seo` (from the
repo root) against the live API — never hand-edit them.

## Configuration

Everything per-environment lives in one block at the top of `index.html`:

```js
window.BRM_CONFIG = {
  klaviyoCompanyId: "…", // PUBLIC key — safe in client code
  klaviyoListId: "…",
  communityApi: "https://map-api.bushriding.cc",
  diaryApi: "/diary-api",
};
```

The basemap needs no configuration: `styles/bush.json` is the brand-recoloured
style on the **OpenMapTiles** schema, served by **OpenFreeMap** (free, no key,
whole planet). Elevation for the 3D view comes from Mapterhorn, also keyless.

## Local preview

Modules + `fetch` need to be served over HTTP (not `file://`):

```sh
cd map && python3 -m http.server 8080
# open http://localhost:8080
```

## Deployment — Cloudflare Pages

1. Pages project connected to this repo.
2. Build command: none (static). **Build output / root directory:** `map`.
3. Auto-deploy on push to `main`.

The two Workers deploy separately — see `.github/workflows/deploy-workers.yml`.

## Data

Each route is one `Feature` whose geometry is the full `LineString`. The pin is
the `marker` coordinate (falling back to the line's start). Controlled vocab:
`terrain_difficulty` ∈ `easy | moderate | hard`; `status` ∈ `published | draft`
(drafts are filtered out client-side).

The live set is served by the community worker, which is the source of truth —
`data/routes.geojson` is only a seed the map merges the API's routes into, so
adding a route means approving it in the worker's `/admin`, not editing a file
here.
