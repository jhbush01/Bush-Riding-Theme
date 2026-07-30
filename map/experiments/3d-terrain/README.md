# 3D terrain spike — mercator + native terrain + hillshade

**Status:** experimental. Lives on `feature/3d-pin-experiment`.
**Not merged to `develop` or `main`. Not linked from `map/index.html` or any nav.**
Desktop/tablet only — mobile is explicitly out of scope.

## What this is, and what it isn't

This **replaces** `map/experiments/3d-pins`, which is deleted from this branch.
That first spike stacked three things — globe projection, 3D terrain, and
Three.js pins through a custom layer. After seeing it live, the decision was:
keep the terrain, drop the other two. Globe projection and the extruded pin
layer added visual noise (and, in the pins' case, needed real redesign work)
without being what the terrain relief itself needed to prove out.

So this is deliberately smaller: **plain MapLibre, mercator projection, a
raster-dem terrain source, and a hillshade layer for shading texture. No
Three.js, no custom layer, no globe, no pins.** If you want the deleted
pins/globe code back, it's in this branch's earlier history (commits `aa32712`
and `ee8f314`), not lost.

"Terrain" vs "texture" — two different things this file provides:
- **`terrain`** (in `style.json`) displaces the actual ground geometry using
  elevation values from the DEM — this is what makes hills look like hills
  under pitch, not just a flat painted image.
- **`hillshade`** (a layer, also reading the same DEM source) paints shading
  onto that geometry — the light/dark relief texture that makes slopes read
  clearly instead of looking like a uniform-coloured lump. You can toggle each
  independently in the HUD to see what each one is actually contributing.

## Run it

No build step. Serve the `map/` directory and open the page:

```bash
cd map && python3 -m http.server 8080
# → http://localhost:8080/experiments/3d-terrain/
```

Or use the Cloudflare Pages branch preview — this repo's stable per-branch
alias is `https://feature-3d-pin-experiment.bush-riding-theme.pages.dev`
(branch name unchanged from the first spike), so:

```
https://feature-3d-pin-experiment.bush-riding-theme.pages.dev/experiments/3d-terrain/
```

## Terrain source — Mapterhorn

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

**Confirmed, two ways.** `mapterhorn.com` itself 403s to every fetch path this
sandbox tried (direct fetch, a reader-proxy fetch, the GitHub API — reads as
the site's own bot protection, not a one-off), but two things got through:

1. Mapterhorn's own GitHub README (`raw.githubusercontent.com`, which *does*
   load) has a "Migration Guide" for people moving off the old AWS/Tilezen
   terrain tiles — it states the tile URL above, the tileSize change from
   256→512, and terrarium encoding explicitly. No API key or account
   anywhere in that repo.
2. The site owner pasted this experiment's actual source catalog (fetched
   from their own browser, where the sandbox's block doesn't apply) — the
   full list of every regional dataset Mapterhorn merges tiles from, each
   with its licence. No pricing or account gate mentioned anywhere in it
   either. **For our region**, the relevant entries are `au5a`–`au5i`
   (Geoscience Australia 5m LiDAR, **CC BY 4.0**) and `glo30` (Copernicus
   GLO-30, 30m, global — the fallback wherever LiDAR hasn't been flown). The
   attribution field above credits both, since crediting the aggregator alone
   wouldn't satisfy either licence's actual attribution requirement.

**Still not confirmed — needs a human with a working browser:**
- **`maxzoom: 14`.** Reasoned, not read off a doc: 5m native LiDAR resolution
  stops adding real detail somewhere around z14–15 at this latitude for
  512px tiles, so 14 is a defensible ceiling, not a guess pulled from air —
  but "defensible" isn't "verified." Open the Network tab, filter for
  `tiles.mapterhorn.com`, and check what happens at your deepest practical
  zoom. 404s past some point: set `maxzoom` to the last zoom that actually
  returned 200.
- **Coverage at this exact spot.** Geoscience Australia's 5m LiDAR is flown
  region-by-region, not continent-wide — SE Queensland may or may not be in
  one of the `au5a`–`au5i` tiles. If it isn't, Mapterhorn should fall back to
  the 30m Copernicus layer automatically (that's the point of merging
  sources server-side), but the visual result — is the D'Aguilar Range crisp
  5m relief or softer 30m relief — is worth actually looking at.

## What to look at

- **Hillshade toggle** — flip it off and the terrain should go flat-shaded and
  much harder to read, even though the geometry (pitch, silhouette) doesn't
  change. That's the terrain/texture distinction above, made visible.
- **Terrain toggle** — flip it off and the ground should go perfectly flat
  under the same pitch — confirms the DEM is actually displacing geometry, not
  just being used for hillshading.
- **Exaggeration +/−** — should visibly steepen or flatten relief in real
  time; also confirms `map.setTerrain()` can be called repeatedly without
  breaking anything.
- **Top-down / Tilt to 3D** — sanity-checks that the terrain and hillshade
  still look right at pitch 0, where 3D relief obviously isn't visible but the
  hillshade layer's texture still is.

## Honest caveats

- **This was never run in a browser before being pushed.** Written in a
  sandbox with no display; the first local or preview run is the real test.
- `style.json` is a **throwaway fork** of `map/styles/bush.json` — not kept in
  sync. If production styling changes, this file does not follow.
- Centered on the D'Aguilar Range / Mount Nebo (`[152.75, -27.35]`) because
  it's real Bush Riding ride country with enough relief to show what
  exaggeration is doing — not tied to any specific route or event data.
- Performance is unmeasured. Hillshade + terrain is lighter than the previous
  spike's custom WebGL layer, but still GPU work — check frame rate before
  calling this successful.

## Guarantees about production

- Zero changes outside `map/experiments/3d-terrain/`.
- `map/styles/bush.json`, `map/src/map.js`, `map/index.html` — untouched.
- No new dependency on Three.js or any CDN beyond what production already
  loads (MapLibre itself).

## If this goes nowhere

Delete the branch. Nothing depends on it.

## If this goes somewhere

Turning this into a real feature (e.g. a "3D view" toggle on the live map) is
a **separate, larger brief**. Open items it would need to answer: whether
`main`'s Cloudflare Pages Functions/CSP allow the Mapterhorn host, how a
terrain toggle interacts with `fitPadding()` and clustering, mobile
performance budget (out of scope here entirely), and finalising the
`maxzoom`/attribution details flagged above as unverified.
