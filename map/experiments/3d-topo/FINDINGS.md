# Findings — vintage 3D topographic demo

**Status:** built, spec-validated, **not yet visually evaluated.**
Branch `feature/3d-pin-experiment`. Not merged to `develop` or `main`.

> **Read this first.** The brief asked for recommended values, screenshots of
> three route types, occlusion rates, and mobile timings. Those require a
> browser. This was built in a sandbox with **no display and no network route
> to `*.pages.dev` or `map-api.bushriding.cc`** (both 403 at the egress proxy).
> So the sections below are split into **VERIFIED** (things actually checked,
> with the method shown) and **TO MEASURE** (procedure written, numbers not
> filled). Nothing here is a guess presented as a result. Fill the blanks from
> a real browser session.

---

## Corrections to the brief

The brief was accurate on stack, file paths, layer-order risk, and rotation
locks. Four things needed changing, all verified:

### 1. Acceptance criterion 4 is not achievable as written — data is empty

The brief's open question 4 asked whether `map/data/routes.geojson` is the
live path. Checked:

```
map/data/routes.geojson   → 52 bytes,  0 features
map/data/events.geojson   → 941 bytes, 1 feature ("Community Bush Ride Point")
```

Production (`map/src/map.js` `init()` → `loadCommunityRoutes()` → `loadEvents()`)
reads the seed file **then tops up from `BRM_CONFIG.communityApi`**
(`https://map-api.bushriding.cc`). The real corpus is in D1 behind that
Worker. So "renders real `routes.geojson` data" cannot be satisfied by the
local files — they are near-empty seeds, not the dataset.

**What was built instead:** `topo.js` mirrors production's exact dual-path
load (seed → Worker top-up, same endpoints, same non-fatal failure handling).
In a browser, where the Worker *is* reachable, this page shows the same routes
the live map shows. From the sandbox it could not be exercised.

**Plus a labelled fallback.** If both seed and Worker return zero routes, three
`SAMPLE —` prefixed corridors over real SEQ terrain load instead, and the
readout prints **"SAMPLE route geometry — not production data"** in red. A demo
that renders nothing answers none of the three objective questions; a demo that
quietly renders fake data as real is worse. This is the honest middle.

### 2. `tilejson.json` — replaced with the verified tile template

The brief specified `"url": "https://tiles.mapterhorn.com/tilejson.json"`.
That endpoint is **unverified** — `mapterhorn.com` and `tiles.mapterhorn.com`
both 403 from this sandbox. What *is* confirmed working (live, in the earlier
`3d-terrain` experiment, in a real browser) is the XYZ template. Used that:

```json
"tiles": ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
"encoding": "terrarium", "tileSize": 512, "maxzoom": 14
```

Two separate sources (`terrainSource`, `hillshadeSource`) pointing at the same
endpoint — kept, as the brief specified; it is the documented MapLibre pattern.

### 3. Attribution needs the data producers, not just Mapterhorn

The brief asked to credit Mapterhorn. Mapterhorn is an **aggregator**; its
source catalog shows SEQ tiles derive from Geoscience Australia's 5 m LiDAR
(**CC BY 4.0**, entries `au5a`–`au5i`) with Copernicus GLO-30 as global
fallback. CC BY requires crediting the *producer*. Attribution now reads:

> Terrain: © Geoscience Australia (CC BY 4.0); contains modified Copernicus DEM
> data; via Mapterhorn

**Also fixed, and worth flagging as a divergence from the brief:** the brief
said to *record* production's missing-OSM-attribution gap, not fix it. This
style file is a fork, so its `openmaptiles` source now carries proper
OpenFreeMap/OSM attribution — the gap is fixed *here only*.
**`map/styles/bush.json` is untouched and still has the gap.** Fixing it there
is a one-line change and should be its own small task.

### 4. Contours: unavailable, but the reference image's real signature is hypsometric tint

Verified: the **OpenMapTiles schema has no contour layer** — OpenFreeMap
cannot serve contours at any zoom. Adding a contour source was out of scope.
Client-side generation (marching squares over the DEM) is real work, not a
config flag. **Verdict: contours not implemented.**

That matters less than expected. Looking at the Grand Teton sheet you
supplied, the dominant visual signature is not the contour lines — it is the
**hypsometric elevation tinting** (green lowlands → cream → tan → brown
highlands) plus soft relief shading. Both are available natively:

| Reference feature | Implemented via | Native? |
|---|---|---|
| Green→tan→brown elevation bands | `color-relief` + `["elevation"]` ramp | yes |
| Soft cartographic relief shading | `hillshade-method: "igor"` | yes |
| Fine ruled grid | client-side GeoJSON graticule | yes |
| Aged paper + vignette | CSS (inline SVG turbulence, no asset) | yes |
| Named peaks with elevations | `mountain_peak` source-layer | yes |
| Contour lines | — | **no** |

---

## VERIFIED — what was actually checked

**Method shown for each so it can be re-run.**

- **MapLibre version.** `grep -n 'maplibre-gl@' map/index.html` → **v5.24.0**.
  Pinned identically in `index.html`. Not assumed.
- **`color-relief` is real in 5.24.0.** Downloaded the actual package
  (`npm pack maplibre-gl@5.24.0`) and read the bundled style spec:
  `color-relief-color` is `property-type: "color-ramp"`, `expression.parameters:
  ["elevation"]`, plus `color-relief-opacity`. This is a genuine hypsometric
  tint driven by DEM elevation.
- **`hillshade-method` exists**, enum `standard | basic | combined | igor |
  multidirectional`, default `standard`. **`igor`** selected — softer,
  lower-contrast, closest to printed cartographic shading.
- **Style validates.** `validateStyleMin()` from
  `@maplibre/maplibre-gl-style-spec` against `style-vintage.json` → **0 errors**,
  including the `color-relief` layer and the elevation ramp.
- **Every request path resolves.** Local static server, all 200:
  `/experiments/3d-topo/`, `topo.js`, `topo.css`, `style-vintage.json`,
  `../../data/routes.geojson`, `../../data/events.geojson`, and `/` (production
  root unaffected).
- **Scope is clean.** `git diff --name-only` → only
  `map/experiments/3d-topo/**` plus `map/_headers` (the one permitted
  exception; added a `/experiments/*` no-cache entry).
- **Rotation locks.** `dragRotate: false`, `pitchWithRotate: false`,
  `map.touchZoomRotate.disableRotation()`, plus a `map.on("rotate")` guard that
  snaps bearing back to 0. Code-verified, not interaction-tested.

---

## TO MEASURE — needs a browser session

Open, then fill in. Preview URL (branch alias, survives new commits):

```
https://feature-3d-pin-experiment.bush-riding-theme.pages.dev/experiments/3d-topo/
```

### Q1. Does relief read as dramatic across real routes?

The **most important finding in the document**, per the brief. Sample three
terrain types and screenshot each. The panel readout prints exaggeration,
pitch, zoom and centre elevation — screenshot it in frame so numbers are
self-documenting.

| Route type | Example | Reads as dramatic? | Screenshot |
|---|---|---|---|
| Escarpment / range | D'Aguilar, Mt Nebo | | |
| Volcanic plugs | Glass House Mountains | | |
| Flat gravel farmland | Lockyer / Fernvale flats | | |

**The decision this drives:** if flat farmland routes look *worse* than the
current flat map, a universal swap is wrong and this should be a toggle
(brief open question 3).

### Q2. What exaggeration value looks right?

Slider is 1.0–3.0, step 0.1, default 1.6. Note where it stops looking like
terrain and starts looking like a caricature. **Recommended value: \_\_\_**

Note also: SEQ maxes around ~1,300 m (Mt Superbus ~1,375 m). The ramp is tuned
for a 0–1,400 m span, so most of the visible palette range is in play here —
it will look different in genuinely alpine country.

### Q3. How badly does terrain occlude pins and route lines?

At the working pitch, roughly what fraction of pins/route sections disappear
behind ridgelines? Rough quantification is fine. **Finding: \_\_\_**

### Terrain data quality

Confirm in the Network tab (filter `tiles.mapterhorn.com`):

- Tiles returning **200** vs **404**? `maxzoom: 14` is reasoned, not confirmed
  — if 404s appear past some zoom, set `maxzoom` to the last zoom returning 200.
- Is SEQ getting **5 m Geoscience Australia LiDAR** (crisp) or the **30 m
  Copernicus fallback** (soft)? Coverage is flown region-by-region.

### Mobile

Brief requires it loads and is interactive. Panel becomes a bottom sheet under
700 px; title block hides. **Load time \_\_\_ · tile bandwidth \_\_\_ · frame
rate \_\_\_ · usable? \_\_\_**

### Data path

Does the readout say `worker + seed` (real data arrived) or `seed only`? If it
shows the red **SAMPLE** flag, the Worker was unreachable — a finding in
itself, and it means Q1/Q3 were judged on sample geometry.

---

## What a production swap would additionally require

Not solved here, and each is real work:

1. **`fitPadding()` under pitch — the top risk.** Reserves 380–500 px
   asymmetric padding assuming a flat top-down camera. Deliberately not used
   here (plain symmetric `fitBounds` instead). Will need retuning.
2. **The four-ring pulse animation under terrain.** Untouched and not present
   here. Its behaviour when rings drape over relief is unverified. It was
   hard-won — read it before changing it.
3. **Clustering** (`clusterRadius: 45`, `clusterMaxZoom: 11`) — not reproduced.
   Cluster bubbles over 3D relief is an unexamined interaction.
4. **The rotation decision.** This demo keeps production's locks. Note the
   sibling `3d-terrain` experiment deliberately does the *opposite* (compass
   drag-to-rotate) — those are two different products and the choice is open.
5. **Mobile GPU/bandwidth budget.** Loose here because internal; always-on
   terrain for every rider is a much stricter bar.
6. **Third-party dependency.** `tiles.mapterhorn.com` is a free external
   endpoint outside your control, with no SLA. Fine for a demo; a real risk for
   production. No fallback DEM is configured.
7. **`map/styles/bush.json` still lacks OSM attribution** (see correction 3).
8. **Contours**, if wanted, need either a contour vector-tile source or
   client-side generation — new infrastructure either way.
