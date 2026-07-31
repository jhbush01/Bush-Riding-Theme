# Bush Riding — context pack for writing briefs

**Purpose.** Paste this whole file into any LLM before asking it to write a
technical brief, feature spec, or plan for Bush Riding. It is a factual
snapshot of what is actually deployed, so briefs don't get written against
assumptions that were never true.

**Audience.** An LLM (or human) drafting a brief that a developer or Claude
Code will then implement. Not an implementation guide — see `CLAUDE.md` for
the rules that govern actually writing code here.

**Verified:** July 2026, against `main`. If you are reading this more than a
few months later, treat versions and file lists as "probably still right, worth
checking" and everything under *Gotchas* as still true.

---

## 0. Rules for whoever writes the brief

1. **Never state the stack from memory — copy it from §2 of this file.** The
   most damaging brief error so far was asserting the map runs on Protomaps
   PMTiles from R2. It doesn't. It runs on OpenFreeMap. Every downstream
   "fallback plan" in that brief was therefore fictional.
2. **One repo, four deployables.** There is no `bush-riding-map` repo, no
   separate theme repo. See §1.
3. **Name real files and real identifiers.** Say `map/src/map.js`,
   `sections/alpine-header.liquid`, `--alp-citrus`, `BRM_CONFIG.communityApi`.
   A brief that says "the map file" or "the config" forces the implementer to
   guess.
4. **State the platform scope explicitly** for any theme/UI change: mobile,
   desktop/tablet, or both. Mobile and desktop are deliberately different
   designs. A brief that omits this will be sent back with a question.
5. **Say where it deploys and how it gets reviewed** — which branch, which
   surface (published theme vs draft theme vs Pages). See §5.
6. **Distinguish "always on" from "opt-in".** A feature every visitor pays for
   (bandwidth, load time) deserves a stricter budget than a toggle almost
   nobody opens. Briefs routinely conflate the two.
7. **Flag what you could not verify.** Better a brief that says "confirm the
   MapLibre version before assuming" than one that confidently states the
   wrong number.
8. **Don't invent scope.** Existing systems that a brief must not casually
   redesign are listed in §6.

---

## 1. Repo and deployables

**Repo:** `jhbush01/Bush-Riding-Theme` (single repo, everything lives here).

| Directory | What it is | Deployed as |
|---|---|---|
| repo root (`sections/`, `assets/`, `templates/`, `layout/`, `snippets/`, `config/`, `locales/`) | Shopify theme, Dawn-derived | Shopify online store, **bushriding.cc** — theme synced from GitHub |
| `map/` | Static MapLibre routes map, no build step | Cloudflare Pages, **map.bushriding.cc** (build output dir = `map`, no build command) |
| `functions/` | Cloudflare **Pages Functions** for the map site | Same Pages project as `map/` |
| `worker/` | Cloudflare Worker `bush-riding-map-api` | **map-api.bushriding.cc** |
| `diary-worker/` | Cloudflare Worker `bush-riding-diary` | **diary.bushriding.cc**, reached same-origin via the `/diary-api` Pages proxy |
| `scripts/` | `generate-route-pages.js` — generates the SEO route pages | Run by GitHub Action |
| `alp1ne/` | Original static design study | Not deployed; reference only |

Workers deploy via Cloudflare's **Git-connected builds** (root dirs `/worker`
and `/diary-worker`). `.github/workflows/deploy-workers.yml` exists as an
alternative path and needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
secrets to function.

---

## 2. The map: exact stack

This is the section briefs get wrong. Copy it verbatim.

- **MapLibre GL JS v5.24.0**, loaded from unpkg via `<script>` in
  `map/index.html`. Not bundled, not npm-installed at serve time.
- **Basemap: OpenFreeMap** — vector tiles on the OpenMapTiles schema, from
  `https://tiles.openfreemap.org/planet`, no API key. The style is a local
  file you own: **`map/styles/bush.json`** (brand-recoloured, `"version": 8`).
- **Protomaps / PMTiles / R2 tiles are NOT in use.** The pmtiles JS library
  (`pmtiles@4.4.1`) is loaded and `maplibregl.addProtocol("pmtiles", …)` is
  registered, and `map/styles/bush-protomaps.json` exists — but that path is
  **dormant scaffolding**. It only activates if `bush.json` is swapped and
  `BRM_CONFIG.tilesUrl` is set. There is no tile bucket and no PMTiles
  pipeline in production.
- **R2 buckets that DO exist:** `bush-riding-map-routes` (GPX + route photos)
  and `bush-riding-diary-files` (diary photos). Neither serves map tiles. Any
  brief proposing to "mirror tiles to R2 alongside the existing ones" is
  proposing new infrastructure, not reuse.
- **D1 databases:** `bush-riding-map` (community routes, events; bound as `DB`
  in the routes worker, read-only as `COMMUNITY_DB` in the diary worker) and
  `bush-riding-diary` (accounts, diary).
- **Vanilla JS, ES modules, no framework, no build step.** There is no React
  anywhere in the map.

### Map source files

| File | Lines | Role |
|---|---|---|
| `map/src/map.js` | ~2240 | Map init, sources/layers, clustering, pin interactions, the detail card/sheet, pulse animation, deck navigation |
| `map/src/diary.js` | ~420 | Accounts, sign-in, "My Submissions". Exposes `window.brmAuth` |
| `map/src/reviews.js` | ~310 | Route reviews (shares `window.brmAuth`) |
| `map/src/gate.js` | ~155 | Klaviyo email capture before GPX download |
| `map/src/filters.js` | ~135 | Client-side filtering over the GeoJSON |
| `map/styles/app.css` | ~1620 | All map UI |
| `map/index.html` | ~450 | The map app; also holds `window.BRM_CONFIG` |

Other pages: `map/submit.html` (route submission), `map/events/index.html`,
and generated SEO pages under `map/routes/**`.

### Runtime config

All per-environment values live in one place — `window.BRM_CONFIG` in
`map/index.html`:

```js
tilesUrl: ""                                  // empty = OpenFreeMap (the live path)
klaviyoCompanyId: "W9QAij"                    // public key
klaviyoListId: "R3335d"
communityApi: "https://map-api.bushriding.cc" // routes/events worker
diaryApi: "/diary-api"                        // same-origin Pages proxy → diary worker
```

### Map design tokens (`map/styles/app.css`)

`--cream #e9e2d0` · `--cream-panel #f4efe2` · `--ink #2c2a24` ·
`--ink-soft #5a5346` · `--line #d8cfb8` · `--olive #6f7c53` · `--sage #aeb995` ·
`--lemon #d7e04b` (active/selected only) · `--water #a7bfbd` ·
`--terracotta #c1572e` (bush event pins) · plus a warmer `--card-*` set for
the detail card.

**Fonts: Archivo** (`--ui-font`) and **Instrument Serif** (`--head-font`).
The map does *not* use General Sans, Inter, or Outfit.

**Pin colours:** Community Routes olive `#6f7c53` · Famous Events plum
`#8a4f7d` · Bush Events terracotta `#c1572e`.

---

## 3. The map: architecture facts a brief must respect

- **Pins are native MapLibre `circle` layers, not DOM markers.** There are
  zero `new maplibregl.Marker` instances. Popups are native
  `maplibregl.Popup`. Hit-testing is `queryRenderedFeatures`.
- **No manual pixel math.** Zero `map.project()` / `map.unproject()` calls.
  (This is why projection changes are cheap here.)
- **Layer insertion:** all ~13 `addLayer` calls in `map.js` append *without* a
  `beforeId`, so anything added at runtime lands on top of everything else. A
  brief that needs a layer underneath the routes must say either "add it to
  `map/styles/bush.json`" or "pass `beforeId: 'selected-route-line'`" — that
  being the first layer added in `onLoad`.
- **Rotation is deliberately disabled:** `dragRotate: false`,
  `pitchWithRotate: false`, `map.touchZoomRotate.disableRotation()`.
- **Clustering:** `cluster: true`, `clusterRadius: 45`, `clusterMaxZoom: 11`.
- **Camera:** `fitBounds` in two places with `maxZoom: 13`, one `easeTo`. All
  use `fitPadding()`, which reserves large asymmetric padding for the sidebar
  and detail panel (up to 380–500px on desktop). Any brief touching zoom or
  projection must name `fitPadding()` as a QA target.
- **The pulse animation** is a `requestAnimationFrame` loop calling
  `setPaintProperty` on four ring layers. Opacity follows `sin` over a
  compressed window so rings fade to zero at both birth and death — this was
  hard-won; don't propose "fixing" it without reading it.
- **Controls:** only `NavigationControl` (bottom-right). The only MapLibre
  control CSS override is `.maplibregl-ctrl-attrib`.
- **Caching:** `map/_headers` sets `no-cache` on HTML, `/src/*`, `/styles/*`
  and data, because filenames aren't fingerprinted. New asset paths may need
  adding there.
- **Known gap:** the OpenFreeMap vector source has no `attribution` field, so
  OSM/OpenFreeMap aren't credited despite `attributionControl` being enabled.

### Existing map filters (get these right)

Distance slider, State + Region selects, Terrain toggles (Groomed / Rocky /
Proper Mud), a reset, and a **pin legend** above Distance. There is also a
hidden "Show on map" category group (kept in the DOM, `display:none`, buttons
left active). There is **no** "condition" or "tier" filter — briefs have
invented these.

---

## 4. The Shopify theme: exact stack

- **Dawn-derived**, Liquid, no build step. Custom work lives in
  `sections/alpine-*.liquid` + `assets/alpine.css` + `assets/alpine.js`.
- **All custom CSS classes are prefixed `alp-`** to avoid colliding with
  Dawn's `base.css`. Tokens are `--alp-*`.
- **Custom sections:** `alpine-header` (bar + Explore menu), `alpine-hero`,
  `alpine-manifesto`, `alpine-collection`, `alpine-statement`,
  `alpine-story`, `alpine-footer`, plus conversion sections `sticky-atc`,
  `value-bar`, `product-specs`. Legacy/unused: `bush-hero`, `main-home-*`.
- **Theme tokens:** `--alp-bg #F2F0E8` · `--alp-surface #FFFFFF` ·
  `--alp-ink #16150F` · `--alp-olive #605C38` · `--alp-haze #B9B3DF` ·
  `--alp-accent #2E2F9E` · `--alp-citrus #E8F13C` (home-page text).
  **Fonts: Outfit** (display) and **Inter** (UI) — different from the map.
- **Home page is one non-scrolling screen:** hero only, with the footer
  overlaid at the base (copyright line only, citrus).
- **The Explore menu** is a full-screen overlay that clip-path-expands from
  the Explore button, containing full-width 16:9 landscape sections with
  off-white chip buttons bottom-right, then nav + legal links.

### Theme constraints briefs must honour

- **Sections need a complete `{% schema %}`** or they're not editable in the
  theme editor.
- **The editor re-renders section HTML on every tweak.** Any JS that reveals
  or animates content must handle `shopify:section:load` and
  `Shopify.designMode`, or content vanishes while editing.
- **Images must render via `image_url | image_tag`, never CSS
  `background-image`**, so the focal point set in the editor controls the crop.
- **`templates/*.json`, `sections/*-group.json`, `config/settings_data.json`
  are editor-owned.** Shopify's bot writes to them. Briefs should prefer
  changes to `.liquid` and `assets/*`, and should expect merchant-set values
  to override schema defaults.
- Product metafields the theme reads: `specs.fabric_tech`, `specs.weight_gsm`,
  `specs.riding_conditions`, `specs.care_guide` (created in admin, not code).

---

## 5. Branches and how work ships

- **`main`** = production. Shopify's published theme follows it; Cloudflare
  Pages and the Workers build from it.
- **`develop`** = integration. Day-to-day work lands here, then
  `develop` → `main` to publish.
- **`theme/alpine`** = incubator, connected to Shopify as an **unpublished
  draft theme**. Theme experiments preview here before merging up.
- **`feature/*`** for experiments.
- Never force-push shared branches.

**A brief should state its target:** *map change* → `develop` → `main`
(Pages redeploys); *theme change* → `theme/alpine` for preview, then
`develop` → `main`.

**Shopify sync caveat:** the Shopify bot commits editor changes back to
connected branches and has once pushed a **stale copy of assets**, silently
reverting code. Always pull before editing; verify recent changes survived.

---

## 6. Systems a brief must not casually redesign

Name them as out of scope unless the brief is explicitly about them:

- **Klaviyo GPX gate** (`map/src/gate.js`) — email capture before download.
- **Accounts / auth** — `window.brmAuth` shared by `diary.js` and
  `reviews.js`; JWT via the diary worker.
- **Route submission + moderation** — `map/submit.html` → routes worker
  `/submit`, admin at `/admin`.
- **Generated SEO route pages** — `map/routes/**` is output from
  `scripts/generate-route-pages.js`. **Never hand-edit.** Changing their
  markup means changing the generator and regenerating.
- **GeoJSON route schema** — `map/data/routes.geojson`, `events.geojson`.
- **The `/diary-api` Pages proxy** — the diary worker is reached same-origin
  through `functions/diary-api/[[path]].js`; the browser never calls it
  cross-origin.

---

## 7. Known open issues (as of this snapshot)

- **Map sign-in returns 530.** `diary.bushriding.cc` has no custom domain
  bound to the `bush-riding-diary` Worker, so the `/diary-api` proxy can't
  reach it. Fix is a dashboard action (add the custom domain) or repointing
  the proxy at the worker's `workers.dev` URL.
- **Legal pages 404.** The Explore menu links `/policies/privacy-policy`,
  `/policies/terms-of-service`, `/policies/shipping-policy`,
  `/policies/refund-policy` — Shopify generates these only once the policies
  are filled in under Settings → Policies.
- Inner theme pages (product, collection, cart) are still largely stock Dawn
  wearing the alpine skin.

---

## 8. Brief template

```markdown
# Brief: <feature>

**Repo:** jhbush01/Bush-Riding-Theme
**Surface:** <Shopify theme (root) | map site (map/) | worker/ | diary-worker/>
**Deploys via:** <branch> → <main> → <Shopify published theme | Cloudflare Pages | Worker build>
**Platform scope:** <mobile | desktop/tablet | both>   ← required for UI work
**Stack (verified):** <copy the relevant lines from §2 or §4>
**Date:**

## Objective
One paragraph. What the rider/visitor gets, and whether this is
presentation-only or touches data/logic.

## Context
What exists today, naming real files. Whether the feature is always-on or
opt-in, and roughly what share of sessions will see it.

## In scope
Numbered steps. For each: the file(s) to touch, the identifiers involved, and
the acceptance test. Call out insertion points and ordering explicitly.

## Out of scope
Name the systems in §6 that this must not touch.

## Risks / QA
The specific existing code this could break — name functions
(e.g. `fitPadding()`, `startPulse()`, `window.brmAuth`) not vague areas.
Include the editor-compat checks for theme work.

## Acceptance criteria
Observable, checkable statements.

## Open questions
Things the implementer should resolve, with a recommendation each.
```

---

## 10. The 3D terrain experiment (`feature/3d-pin-experiment`, not merged)

**Verified:** 31 July 2026, against `feature/3d-pin-experiment` at commit
`e736393` — this branch, not `main`. Live-tested by the site owner via a
Cloudflare Pages branch preview (see §5 for what that means); not yet on
`develop` or `main`, and not linked from anywhere in the live map. **If a
brief targets this work, state explicitly that it builds on this branch, not
`main`** — none of this exists in production yet.

**What it is:** an explorer-styled 3D terrain view, standalone at
`map/experiments/3d-terrain/` — its own `index.html` / `app.js` /
`style.json` / `README.md`, no build step, same MapLibre v5.24.0 build as
production. **Mercator only — no globe.** No Three.js, no custom WebGL layer,
no 3D pins/markers. An earlier version of this spike (globe projection +
Three.js pins through a `CustomLayerInterface`) was built, tried live, and
**deliberately dropped** — the globe and pins added visual noise without
being what the terrain relief needed to prove out. That earlier code isn't
lost, just not current: it's in this branch's history at commits `aa32712`
and `ee8f314` if anyone wants to resurrect the globe/pins direction
specifically.

**Terrain source: Mapterhorn**, confirmed free with no API key or account
(from Mapterhorn's own GitHub README and the site owner's own fetch of
`mapterhorn.com/data-access/`, whose source catalog lists every regional DEM
it merges):

```json
"terrain-dem": {
  "type": "raster-dem",
  "tiles": ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
  "encoding": "terrarium",
  "tileSize": 512,
  "maxzoom": 14,
  "attribution": "Terrain: © Geoscience Australia (CC BY 4.0), contains modified Copernicus DEM data (COPERNICUS full, free and open licence), via Mapterhorn (mapterhorn.com/attribution)"
}
```

For SE Queensland specifically, Mapterhorn's tiles are backed by Geoscience
Australia's 5m LiDAR (`au5a`–`au5i` in their catalog, **CC BY 4.0**) where
it's been flown, falling back to Copernicus GLO-30 (30m, global) elsewhere.
**`maxzoom: 14` is a reasoned default, not a confirmed number** — nobody has
checked the Network tab for the actual 404 cutoff yet.

**Mapterhorn is a raster-dem source and nothing else.** A brief that assumes
it also provides contour lines, a hillshade *tile* service, or any kind of
vector overlay is wrong — those aren't things Mapterhorn offers. Terrain
displacement (`map.setTerrain()`) and a MapLibre `hillshade` layer reading
the same DEM are the *complete* set of things a raster-dem source can drive.
**Contours are unimplemented and would need new infrastructure** — either a
dedicated contour vector-tile source, or client-side computation from the DEM
raster (marching squares) — not a config flag on the existing setup.

**What's implemented, in the HUD:**
- Terrain toggle (on/off — `map.setTerrain(null)` vs restoring it)
- Hillshade toggle (layer visibility)
- Top-down / tilt toggle (`pitch` 0 ↔ 65)
- Exaggeration +/− (range 0.4–2.6, step 0.2, default 1.4)
- **Compass control** (top-right, own pointer-event code — not
  `NavigationControl`'s compass): drag to rotate the bearing, click/tap to
  reset to north. Production's map (§3) has rotation *disabled*
  (`dragRotate: false`) — this experiment deliberately does the opposite,
  since "you can spin the map" is part of the explorer feel being tested.
- Live centre-elevation readout (`map.queryTerrainElevation()`) in the stat
  line — free once terrain tiles are loaded, no extra request.
- `minZoom: 7` — confirmed live (31 July 2026) to stop the "dead space" that
  showed at low zoom + `pitch: 65`, where the camera saw past the rendered
  terrain into flat background colour at the horizon. `maxPitch: 85` is the
  other lever on the same problem if it resurfaces.

**Guarantees about production, unchanged by any of this:**
`map/styles/bush.json`, `map/src/map.js`, `map/index.html` — all untouched.
Zero new dependency beyond MapLibre itself (no Three.js anymore, no CDN
additions). Desktop/tablet only, by design — no mobile work has been done or
attempted here.

**If you're brainstorming new features for this**, ground them in what's
above: real Mapterhorn capabilities (elevation only — no contours without new
infra), the toggles that already exist (don't re-propose them), and the fact
that shipping this to production is its own separate brief that would need to
reconcile with production's `fitPadding()`, clustering, disabled rotation,
and mobile budget — none of which this experiment has touched or solved.

---

## 11. How to keep this file honest

It is a snapshot; code moves. Before relying on it for a significant brief,
re-verify the handful of things that change most:

```bash
grep -n 'maplibre-gl@' map/index.html          # MapLibre version
grep -n 'openfreemap\|pmtiles' map/styles/bush.json | head   # which basemap
sed -n '/window.BRM_CONFIG/,/};/p' map/index.html            # runtime config
ls sections/ | grep alpine                     # theme sections
git branch -a                                  # branches
```

Ask Claude Code to refresh this file whenever the stack changes — it's cheap
and it prevents the class of error that made the first globe brief unusable.
