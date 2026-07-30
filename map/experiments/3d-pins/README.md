# 3D pin spike — globe + terrain + Three.js custom layer

**Status:** experimental learning spike. Lives on `feature/3d-pin-experiment`.
**Not merged to `develop` or `main`. Not linked from `map/index.html` or any nav.**
Desktop/tablet only — mobile is explicitly out of scope.

## What this is

One standalone page stacking three things:

| | What | How |
|---|---|---|
| 1 | Globe projection | **Native MapLibre v5** — `projection: {type: "globe"}` in `style.json` |
| 2 | 3D terrain | **Native MapLibre v5** — `raster-dem` source + `terrain` in `style.json` |
| 3 | Extruded 3D pins | **Three.js** through a MapLibre `CustomLayerInterface` |

Only **(3)** is new capability. Globe and terrain need no third-party renderer —
they are native and would work with zero Three.js. The custom layer is the
actual learning target: geometry MapLibre's paint properties can't express
(an extruded tower with a pulsing sphere on top).

## Run it

No build step. Serve the `map/` directory and open the page:

```bash
cd map && python3 -m http.server 8080
# → http://localhost:8080/experiments/3d-pins/
```

Or push the branch and use a Cloudflare Pages **branch preview** deploy.

## Why plain Three.js, not React-Three-Fiber

The brief left this open. It was decided on a hard constraint, not taste:

**Cloudflare Pages builds `map/` with no build command.** R3F needs React plus a
bundler, which would mean either committing build output or changing the Pages
build configuration — and that configuration is shared with production. Plain
Three.js loads as an ES module from a CDN via an import map, so this page
deploys under the existing config exactly like the production map does, and a
branch preview Just Works.

If the goal is specifically to learn R3F's component/hook model, that's a
separate spike that should run from a local Vite dev server and never be
expected to deploy through the current Pages setup. The underlying technique —
a MapLibre custom layer sharing the WebGL context — is identical either way;
R3F only changes how you author the scene graph.

## Terrain source — needs live verification

`style.json` currently uses **AWS Open Data Terrain Tiles** (Terrarium
encoding, no API key):

```json
"terrain-dem": {
  "type": "raster-dem",
  "tiles": ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  "encoding": "terrarium",
  "tileSize": 256,
  "maxzoom": 13,
  "attribution": "Terrain: Mapzen / AWS Open Data"
}
```

The brief recommended **Mapterhorn** instead. Neither endpoint could be reached
from the sandbox this was written in, so the longer-established of the two was
chosen as the default and Mapterhorn is left as a documented one-block swap.
**Verify whichever you use actually serves tiles over Australia before drawing
conclusions from this spike** — if the DEM 404s, the globe still renders and the
terrain silently looks flat, which reads as "terrain doesn't work" when really
the tiles just aren't arriving. The page shows a warning banner if it detects
DEM errors.

Latency note: the AWS mirror is us-east; from Australia it may be slow even
when it is working.

## What to look at

- **Globe + spin** — auto-rotates on load, stops on any interaction.
- **Projection toggle** — flip globe ↔ mercator and watch the pins stay put.
  This is the main correctness check: the camera matrix comes from
  `args.defaultProjectionData.mainMatrix` each frame, so meshes should track
  both projections with no manual math.
- **Fly to pins** — drops to a pitched view where terrain relief is visible and
  the pins should sit *on* the ground, not float. Pin altitude is set from
  `map.queryTerrainElevation()` once DEM tiles land.
- **Pulse** — the sphere breathes on a sine that hits zero at both ends of the
  cycle, so there's no pop on reset.

## Honest caveats

- **This was never run in a browser.** It was written in a sandbox with no
  display, so the first local run is the real test. The most likely thing to
  need adjustment is 3D mesh placement under **globe** projection specifically —
  MapLibre's custom-layer ↔ globe interaction is version-sensitive, and if the
  pins sit wrongly in globe but correctly in mercator, that's the code to fix,
  not the concept.
- **Performance is unmeasured.** Globe + terrain + a custom WebGL layer is
  GPU-heavy by design. Check frame rate on a mid-tier laptop GPU before calling
  the spike successful. No mobile QA — out of scope, a known limitation rather
  than a bug.
- `style.json` is a **throwaway fork** of `map/styles/bush.json`. It is not kept
  in sync. If production styling changes, this file does not follow.
- Sample coordinates: `map/data/events.geojson` holds only **one** feature (the
  real events live in D1 behind `map-api.bushriding.cc`), so the page reads that
  seed and tops up from a small hardcoded list of real Bush Riding ride
  locations to reach 3–5 pins.

## Guarantees about production

- Zero changes outside `map/experiments/3d-pins/`.
- `map/src/map.js` and its four-ring `startPulse()` — untouched, not imported.
  The pulse here is separate code.
- `fitPadding()`, clustering config, production pin layers — untouched.
- `map/styles/bush.json`, `map/index.html` — untouched.

## If this goes nowhere

Delete the branch. Nothing depends on it.

## If this goes somewhere

Shipping 3D pins to production is a **separate, larger brief**. It would have to
reconcile with: the existing 2D pulse system, clustering (`clusterRadius: 45`,
`clusterMaxZoom: 11`), `fitPadding()`'s 380–500px asymmetric reserves,
`queryRenderedFeatures` hit-testing (a Three.js mesh is not a MapLibre feature —
clicks would need raycasting), the mobile performance budget, and production's
deliberate `dragRotate: false`. None of that is solved here.
