// Bush Riding — vintage 3D topographic demo (EXPERIMENTAL, not production).
//
// Standalone decision-making artifact. Ships nothing to riders. Imports
// nothing from map/src/*, and nothing in map/src/* imports this.
//
// Deliberately NOT reproduced here (see brief "Out of scope"): clustering,
// filters, the detail card/sheet, the four-ring pulse animation, deck
// navigation, and fitPadding(). Framing is a plain fitBounds.

/* ── Config ───────────────────────────────────────────────────────────────
   Copied from window.BRM_CONFIG in map/index.html — verified with
   `sed -n '/window.BRM_CONFIG/,/};/p' map/index.html`, not assumed. This page
   has no BRM_CONFIG of its own by design: it must not depend on production's
   HTML, and production must not have to know this page exists. */
const COMMUNITY_API = "https://map-api.bushriding.cc";

/* Production pin colours (map/src/map.js lines 13–21), copied verbatim. */
const OLIVE = "#6f7c53"; // community routes
const SERIES = "#8a4f7d"; // famous rides
const TERRACOTTA = "#c1572e"; // bush events
const SEPIA = "#4a3b27";

const els = {
  exag: document.getElementById("exag"),
  exagVal: document.getElementById("exag-val"),
  pitch: document.getElementById("pitch"),
  pitchVal: document.getElementById("pitch-val"),
  tTerrain: document.getElementById("t-terrain"),
  tHillshade: document.getElementById("t-hillshade"),
  tRelief: document.getElementById("t-relief"),
  tGrid: document.getElementById("t-grid"),
  tPaper: document.getElementById("t-paper"),
  readout: document.getElementById("readout"),
  warn: document.getElementById("warn"),
};

let exaggeration = parseFloat(els.exag.value);
let terrainOn = true;
const dataStatus = { routes: 0, famous: 0, events: 0, source: "…", sample: false };

/* ── Map ──────────────────────────────────────────────────────────────────
   Locked "diorama" camera. Every rotation lock from production is kept:
   dragRotate, pitchWithRotate, and touchZoomRotate.disableRotation() below.
   Pitch is adjustable ONLY through the demo slider — that is tuning, not a
   user-facing orbit control. */
const map = new maplibregl.Map({
  container: "map",
  style: "./style-vintage.json",
  center: [152.62, -27.2],
  zoom: 9.4,
  pitch: parseFloat(els.pitch.value),
  bearing: 0,
  maxPitch: 75,
  dragRotate: false,
  pitchWithRotate: false,
  attributionControl: { compact: true },
});

map.touchZoomRotate.disableRotation();
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

// Belt-and-braces on acceptance criterion 3: if any input path ever does
// manage to change bearing, snap it straight back to 0.
map.on("rotate", () => {
  if (map.getBearing() !== 0) map.setBearing(0);
});

map.on("error", (e) => {
  const msg = e?.error?.message || "unknown map error";
  if (/terrain|dem|elevation|hillshade|relief/i.test(msg)) {
    showWarn("DEM tiles not loading — check the Network tab for tiles.mapterhorn.com.");
  }
});

function showWarn(text) {
  els.warn.hidden = false;
  els.warn.textContent = text;
}

map.on("load", async () => {
  map.setTerrain({ source: "terrainSource", exaggeration });

  addGraticule();
  await loadData();
  updateReadout();
});

/* ── Data ─────────────────────────────────────────────────────────────────
   Mirrors production's real loading path (map/src/map.js `init()`,
   `loadCommunityRoutes()`, `loadEvents()`): local seed file first, then top
   up from the community Worker.

   IMPORTANT, and the reason the brief's acceptance criterion 4 needed
   amending: map/data/routes.geojson currently contains ZERO features and
   map/data/events.geojson contains ONE. The real corpus lives in D1 behind
   map-api.bushriding.cc. So "render real routes.geojson data" is not
   achievable from the local files alone — the API call is what actually
   populates this page, exactly as it is for production. See FINDINGS.md. */
async function loadData() {
  let routes = [];
  let events = [];

  try {
    const seed = await fetch("../../data/routes.geojson").then((r) => r.json());
    routes = seed.features || [];
  } catch (_) {
    /* non-fatal, matching production */
  }

  const api = COMMUNITY_API.replace(/\/$/, "");
  let apiOk = false;
  try {
    const res = await fetch(api + "/routes?t=" + Date.now(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const fc = await res.json();
      const have = new Set(routes.map((f) => f.properties?.id));
      for (const f of fc.features || []) {
        if (!have.has(f.properties?.id)) routes.push(f);
      }
      apiOk = true;
    }
  } catch (e) {
    console.warn("Community routes unavailable:", e.message);
  }

  try {
    const res = await fetch(api + "/events?t=" + Date.now(), {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const fc = await res.json();
      events = (fc.features || []).filter((f) => f.geometry?.type === "Point");
    } else {
      throw new Error("worker " + res.status);
    }
  } catch (_) {
    try {
      const seed = await fetch("../../data/events.geojson").then((r) => r.json());
      events = (seed.features || []).filter((f) => f.geometry?.type === "Point");
    } catch (e) {
      console.warn("Could not load events.geojson:", e.message);
    }
  }

  dataStatus.source = apiOk ? "worker + seed" : "seed only (worker unreachable)";

  // A demo that renders nothing answers none of the brief's three questions.
  // If both the seed and the worker come back empty, fall back to clearly
  // labelled SAMPLE geometry over real SEQ terrain so relief, occlusion and
  // exaggeration can still be judged. Flagged in the readout so nobody
  // mistakes it for production data.
  const lineCount = routes.filter((f) => /LineString/.test(f.geometry?.type || "")).length;
  if (lineCount === 0) {
    routes = SAMPLE_ROUTES.concat(routes);
    dataStatus.sample = true;
  }

  addRouteLayers(routes);
  addFamousLayer(routes);
  addEventLayer(events);

  dataStatus.routes = routes.filter((f) => /LineString/.test(f.geometry?.type || "")).length;
  dataStatus.events = events.length;

  fitToData(routes, events);
}

/* All addLayer calls below append without a beforeId, so they land ABOVE
   color-relief and hillshade — both of which are declared in
   style-vintage.json rather than added here, precisely so this ordering is
   guaranteed rather than incidental (brief §6). */
function addRouteLayers(routes) {
  const lines = {
    type: "FeatureCollection",
    features: routes.filter((f) => /LineString/.test(f.geometry?.type || "")),
  };
  map.addSource("topo-routes", { type: "geojson", data: lines });

  // Casing first, then the line — the printed-sheet look comes from a pale
  // halo separating the route from busy relief underneath.
  map.addLayer({
    id: "topo-route-casing",
    type: "line",
    source: "topo-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#F4EFE2",
      "line-opacity": 0.85,
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.4, 14, 7.5],
    },
  });
  map.addLayer({
    id: "topo-route-line",
    type: "line",
    source: "topo-routes",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": OLIVE,
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.5, 14, 3.6],
    },
  });
}

/* Famous rides: production derives these from route features carrying a
   `famous_ride` property and places one plum pin per named ride
   (map/src/map.js `famousFC()`). Same derivation, simplified — first
   coordinate of the first matching feature per ride name. */
function addFamousLayer(routes) {
  const byName = new Map();
  for (const f of routes) {
    const fr = f.properties?.famous_ride;
    if (!fr) continue;
    const name = typeof fr === "string" ? fr : fr.name;
    if (!name || byName.has(name)) continue;
    const c = firstCoord(f.geometry);
    if (c) byName.set(name, c);
  }

  const fc = {
    type: "FeatureCollection",
    features: [...byName].map(([name, coordinates]) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { name },
    })),
  };
  dataStatus.famous = fc.features.length;

  map.addSource("topo-famous", { type: "geojson", data: fc });
  map.addLayer({
    id: "topo-famous-core",
    type: "circle",
    source: "topo-famous",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5.5, 14, 9],
      "circle-color": SERIES,
      "circle-stroke-color": "#F4EFE2",
      "circle-stroke-width": 1.6,
    },
  });
}

function addEventLayer(events) {
  map.addSource("topo-events", { type: "geojson", data: { type: "FeatureCollection", features: events } });
  map.addLayer({
    id: "topo-event-core",
    type: "circle",
    source: "topo-events",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 14, 8],
      "circle-color": TERRACOTTA,
      "circle-stroke-color": "#F4EFE2",
      "circle-stroke-width": 1.6,
    },
  });
}

function firstCoord(geom) {
  if (!geom) return null;
  if (geom.type === "Point") return geom.coordinates;
  if (geom.type === "LineString") return geom.coordinates[0];
  if (geom.type === "MultiLineString") return geom.coordinates[0]?.[0];
  return null;
}

function fitToData(routes, events) {
  const b = new maplibregl.LngLatBounds();
  let any = false;
  const push = (c) => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      b.extend(c);
      any = true;
    }
  };
  for (const f of routes) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") g.coordinates.forEach(push);
    else if (g.type === "MultiLineString") g.coordinates.forEach((l) => l.forEach(push));
    else if (g.type === "Point") push(g.coordinates);
  }
  for (const f of events) push(f.geometry?.coordinates);

  // Plain symmetric padding on purpose. Production's fitPadding() reserves
  // 380–500px asymmetrically for the sidebar/detail panel and is untested
  // under pitch — reproducing it is separate work and a named risk.
  if (any) map.fitBounds(b, { padding: 90, maxZoom: 12.5, duration: 0 });
}

/* ── Graticule ────────────────────────────────────────────────────────────
   The fine ruled grid on a printed quadrangle sheet. Generated client-side
   as plain GeoJSON — no tile source, no new dependency. */
function addGraticule() {
  const step = 0.25;
  const [w, s, e, n] = [151.2, -28.6, 154.0, -26.0];
  const features = [];
  for (let lng = Math.ceil(w / step) * step; lng <= e; lng += step) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[lng, s], [lng, n]] },
      properties: {},
    });
  }
  for (let lat = Math.ceil(s / step) * step; lat <= n; lat += step) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[w, lat], [e, lat]] },
      properties: {},
    });
  }
  map.addSource("topo-graticule", { type: "geojson", data: { type: "FeatureCollection", features } });
  map.addLayer({
    id: "topo-graticule",
    type: "line",
    source: "topo-graticule",
    paint: { "line-color": SEPIA, "line-opacity": 0.16, "line-width": 0.6 },
  });
}

/* ── Controls ─────────────────────────────────────────────────────────── */
els.exag.addEventListener("input", () => {
  exaggeration = parseFloat(els.exag.value);
  els.exagVal.textContent = exaggeration.toFixed(1);
  if (terrainOn) map.setTerrain({ source: "terrainSource", exaggeration });
  updateReadout();
});

els.pitch.addEventListener("input", () => {
  const p = parseFloat(els.pitch.value);
  els.pitchVal.textContent = p + "°";
  map.setPitch(p);
  updateReadout();
});

els.tTerrain.addEventListener("change", () => {
  terrainOn = els.tTerrain.checked;
  map.setTerrain(terrainOn ? { source: "terrainSource", exaggeration } : null);
  updateReadout();
});

els.tHillshade.addEventListener("change", () => {
  setVis("hillshade", els.tHillshade.checked);
  updateReadout();
});

els.tRelief.addEventListener("change", () => {
  setVis("color-relief", els.tRelief.checked);
  updateReadout();
});

els.tGrid.addEventListener("change", () => setVis("topo-graticule", els.tGrid.checked));

els.tPaper.addEventListener("change", () => {
  const on = els.tPaper.checked;
  for (const sel of [".paper-grain", ".vignette"]) {
    document.querySelector(sel).style.display = on ? "" : "none";
  }
});

function setVis(layerId, visible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

/* Readout doubles as the "copy these numbers into the next brief" surface
   the brief asked for, and as live evidence for the occlusion question. */
function updateReadout() {
  const c = map.getCenter();
  const elev = terrainOn ? map.queryTerrainElevation(c) : null;
  const elevText = elev == null ? "—" : Math.round(elev) + " m";
  els.readout.innerHTML =
    `exaggeration <b>${exaggeration.toFixed(1)}</b> · pitch <b>${Math.round(map.getPitch())}°</b> · bearing <b>${Math.round(map.getBearing())}°</b><br>` +
    `zoom ${map.getZoom().toFixed(2)} · centre elev ${elevText}<br>` +
    `routes ${dataStatus.routes} · famous ${dataStatus.famous} · events ${dataStatus.events}<br>` +
    `data: ${dataStatus.source}` +
    (dataStatus.sample ? `<br><b style="color:#8a3f18">SAMPLE route geometry — not production data</b>` : "");
}
map.on("move", updateReadout);

/* ── Sample fallback geometry ─────────────────────────────────────────────
   Used ONLY when both the seed file and the worker return no routes (the
   current state of map/data/routes.geojson — zero features). Real SEQ ride
   corridors, hand-traced coarsely; enough to judge relief, drape and
   occlusion. Not production data and never presented as such. */
const SAMPLE_ROUTES = [
  {
    type: "Feature",
    properties: { id: "sample-dag", name: "SAMPLE — D'Aguilar Range traverse" },
    geometry: {
      type: "LineString",
      coordinates: [
        [152.7594, -27.3312], [152.7731, -27.3068], [152.7903, -27.2814],
        [152.8064, -27.2536], [152.8158, -27.2247], [152.8231, -27.1969],
        [152.8302, -27.1662], [152.8221, -27.1394], [152.8036, -27.1258],
      ],
    },
  },
  {
    type: "Feature",
    properties: { id: "sample-glass", name: "SAMPLE — Glass House circuit" },
    geometry: {
      type: "LineString",
      coordinates: [
        [152.9553, -26.8992], [152.9331, -26.9106], [152.9088, -26.9247],
        [152.8894, -26.9436], [152.8807, -26.9702], [152.8961, -26.9884],
        [152.9244, -26.9861], [152.9468, -26.9668], [152.9553, -26.8992],
      ],
    },
  },
  {
    type: "Feature",
    properties: { id: "sample-flat", name: "SAMPLE — Lockyer flats (low relief control)" },
    geometry: {
      type: "LineString",
      coordinates: [
        [152.2647, -27.5518], [152.3092, -27.5473], [152.3541, -27.5406],
        [152.3998, -27.5361], [152.4432, -27.5297], [152.4879, -27.5241],
      ],
    },
  },
];
