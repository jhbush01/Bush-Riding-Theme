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

## Terrain source — switched to Mapterhorn

`style.json` now uses **Mapterhorn**, per the brief:

```json
"terrain-dem": {
  "type": "raster-dem",
  "tiles": ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
  "encoding": "terrarium",
  "tileSize": 512,
  "maxzoom": 14,
  "attribution": "Terrain: Mapterhorn (mapterhorn.com/attribution)"
}
```

Confirmed free, no API key, from Mapterhorn's own README
(`github.com/mapterhorn/mapterhorn`): XYZ raster-dem tiles, WebP, Terrarium
encoding, 512px tiles, global coverage (derived from Copernicus GLO-30, which
includes Australia). `mapterhorn.com` itself 403s to this sandbox's fetcher —
same proxy block noted below — so two things are unverified and worth a look
in the Network tab on first run:

- **`maxzoom: 14`** is a reasonable guess, not confirmed. If tiles 404 at deep
  zoom, MapLibre won't auto-overzoom past a wrong maxzoom — lower this number
  to whatever the highest zoom is that actually returns tiles.
- **Attribution wording.** The field above is a placeholder. Open
  `mapterhorn.com/attribution` directly (you already have that tab open) and
  copy the required text/HTML in verbatim before this goes anywhere public.

Same rule as before applies: if the DEM 404s, the globe still renders and
terrain silently looks flat, which reads as "terrain doesn't work" when really
the tiles just aren't arriving. The page's warning banner fires on DEM errors.

## Pin design — real map-pin silhouette, not a lollipop

First pass (cylinder + glowing sphere) read as a toy, not a map pin. Rebuilt as
three primitives stacked bottom-up: a red cone tip staked into the terrain, a
dark metal neck, a chrome ball head — plus a procedural environment map
(`RoomEnvironment` run through `THREE.PMREMGenerator`, generated at runtime,
no external HDRI file to host or fetch) so `metalness` actually has something
to reflect. Without an environment map, `metalness: 1` just renders as dark
flat grey — that was never going to look metallic no matter what colour was
picked.

The "breathing" animation moved **off** the pin and onto a flat ring on the
ground underneath it, radar-style — a thumbtack doesn't pulse, but the spike
still needs a pulse to validate against `PULSE_PERIOD_MS`. Same zero-at-both-
ends sine as before, same idea as production's ring pulse, still separate code
from `map/src/map.js`.

This was **sourced from primitives, not an external asset** — no glTF/OBJ
pin model was pulled in. If a procedural chrome-and-red pin still doesn't read
as "real" once you've seen it render, the next step up is a small downloadable
pin/marker model (glTF, a few hundred KB) committed into this folder and loaded
with `GLTFLoader` — that's a deliberate escalation, not done here, because it
adds a binary asset and a loader dependency for a look that primitives + a
metal material might already deliver. Judge in-browser first.

## What to look at

- **Globe + spin** — auto-rotates on load, stops on any interaction.
- **Projection toggle** — flip globe ↔ mercator and watch the pins stay put.
  This is the main correctness check: the camera matrix comes from
  `args.defaultProjectionData.mainMatrix` each frame, so meshes should track
  both projections with no manual math.
- **Fly to pins** — drops to a pitched view where terrain relief is visible and
  the pins should sit *on* the ground, not float. Pin altitude is set from
  `map.queryTerrainElevation()` once DEM tiles land.
- **Metal reflections** — the head and neck should visibly catch light and show
  some environment reflection, not read as flat grey plastic. If they still
  look flat, the PMREM environment likely isn't attaching — check the console.
- **Pulse** — the ground ring under each pin grows and fades on a sine that
  hits zero at both ends of the cycle, so there's no pop on reset.

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
- **Sample coordinates — a data gap the brief didn't know about, resolved by
  not fixing it here.** `map/data/events.geojson` holds one placeholder feature
  near Toowoomba; `routes.geojson` is empty. The real events live in D1 behind
  `map-api.bushriding.cc`. The page reads the seed file (as instructed) and
  tops up from a small hardcoded list of **real** Bush Riding ride locations to
  reach five — so the pins sit over genuine terrain relief in genuine places,
  just not fetched live. Deliberately **not** wired to the live API for this
  spike:
  - the spike's job is validating globe + terrain + the custom layer, not data
    plumbing;
  - a preview URL is a different origin
    (`<hash>.bush-riding-theme.pages.dev`) than production, and whether
    `map-api.bushriding.cc`'s CORS policy allows arbitrary preview
    subdomains is untested — chasing that down would mean touching the
    production Worker's CORS config for an experimental page, which is
    exactly the shared-config risk this spike was built to avoid;
  - if this graduates past a spike, wiring live D1 data is its own explicit
    task, same category as the clustering/hit-testing/mobile-budget work
    already listed below under "If this goes somewhere."

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
