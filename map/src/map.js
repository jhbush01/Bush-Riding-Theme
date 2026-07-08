// Bush Riding Routes — map init, sources/layers, pins, selection, panel.
import { setupFilters, applyFilters } from "./filters.js";
import { setupGate } from "./gate.js";

const CONFIG = window.BRM_CONFIG || {};
// Single swappable line for the basemap tiles (set in index.html config block).
const TILES_URL = CONFIG.tilesUrl;

// Bush-lemon highlights the selected pin; the route line is dark green for
// legibility against the muted basemap.
const LEMON = "#d7e04b";
const ROUTE_LINE = "#234a25";
const OLIVE = "#6f7c53";
const SAGE = "#aeb995";
// Community Bush Ride event accent — deep terracotta so event pins win the
// visual hierarchy over route pins. Past events render muted grey.
const TERRACOTTA = "#c1572e";
const EVENT_PAST = "#8f8a7e";
// Route-series / event pin — a plum distinct from route (olive), community-event
// (terracotta) and cluster (sage) pins, so a multi-route event reads at a glance.
const SERIES = "#8a4f7d";

let map;
let mapReady = false;
let routeFeatures = []; // full LineString features
const routeById = new Map();
let selectedId = null;
let requestDownload; // from gate
// Routes that share a start (e.g. a 50/95/135 km set from one trailhead) collapse
// to a single pin. routeToPinId maps each route id to its pin's id (the group's
// first route) so selecting any member still highlights the right pin.
let routeToPinId = new Map();
let routeChooserPopup = null; // open "N routes from here" picker, if any

// Community Bush Ride events (additive; separate source, never filtered).
let eventFeatures = [];
const eventById = new Map();

init();

async function init() {
  // Load the route data first and build the sidebar from it, so browsing and
  // filtering work even if the map library or basemap tiles fail to load.
  try {
    const data = await fetch("data/routes.geojson").then((r) => r.json());
    routeFeatures = data.features;
    routeFeatures.forEach((f) => routeById.set(f.properties.id, f));
  } catch (e) {
    console.error("Could not load routes.geojson:", e);
    return;
  }

  // Merge in approved community submissions (additive; failure is non-fatal so
  // the curated map always works even if the Worker is down).
  await loadCommunityRoutes();

  // Community Bush Ride events (additive, separate source). Base data lives in
  // data/events.geojson; the Worker supplies interested_count / status
  // overrides. Both are non-fatal — the map works without either.
  await loadEvents();

  initUI();

  // The map is an enhancement — if it throws, the list/filters still work.
  try {
    await initMap();
  } catch (e) {
    console.error("Map failed to initialise; routes are still browsable.", e);
  }
}

async function loadCommunityRoutes() {
  const api = (CONFIG.communityApi || "").replace(/\/$/, "");
  if (!api) return;
  try {
    // Cache-bust so a newly approved route shows on the next map load (not
    // after a stale-cache window).
    const res = await fetch(api + "/routes?t=" + Date.now(), {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return;
    const fc = await res.json();
    for (const f of fc.features || []) {
      if (!routeById.has(f.properties.id)) {
        routeFeatures.push(f);
        routeById.set(f.properties.id, f);
      }
    }
  } catch (e) {
    console.warn("Community routes unavailable:", e.message);
  }
}

// Load events. The Worker (admin-managed) is the source of truth; the static
// events.geojson is the offline fallback / initial seed. Non-fatal either way.
async function loadEvents() {
  const api = (CONFIG.communityApi || "").replace(/\/$/, "");
  if (api) {
    try {
      const res = await fetch(api + "/events?t=" + Date.now(), {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        // The Worker is the source of truth — trust it even when it returns an
        // empty list (e.g. every event was deleted). Only fall back to the
        // static seed if the Worker is actually unreachable, otherwise a delete
        // would resurrect the seeded event on the next load.
        const fc = await res.json();
        setEventFeatures((fc.features || []).filter((f) => f.geometry && f.geometry.type === "Point"));
        return;
      }
    } catch (e) {
      console.warn("Worker events unavailable, using static seed:", e.message);
    }
  }
  try {
    const data = await fetch("data/events.geojson").then((r) => r.json());
    setEventFeatures((data.features || []).filter((f) => f.geometry && f.geometry.type === "Point"));
  } catch (e) {
    console.warn("Could not load events.geojson:", e.message);
  }
}

function setEventFeatures(feats) {
  eventFeatures = feats;
  eventById.clear();
  eventFeatures.forEach((f) => eventById.set(f.properties.id, f));
}

// Resolve a hero reference: a full URL (Worker upload / external) is used as-is;
// a bare filename is served from the site's public/ folder (static seed).
function resolveHero(ref) {
  if (!ref) return "";
  return /^https?:\/\//i.test(ref) ? ref : "public/" + ref;
}

// Wire everything that does NOT depend on the map being up.
function initUI() {
  requestDownload = setupGate();
  setupFilters(routeFeatures, refresh);
  setupDetailPanel();
  setupSidebarToggle();
  renderResults(applyFilters(routeFeatures));

  // Deep link: /#<route-id> (also legacy /map#<route-id>, which redirects here)
  // opens that route. Handled here so it works even if the basemap never
  // loads; onLoad redraws the line once the map is ready.
  selectFromHash();
  window.addEventListener("hashchange", selectFromHash);
}

function selectFromHash() {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (id && routeById.has(id)) selectRoute(id, true);
}

async function initMap() {
  // Register the pmtiles:// protocol so MapLibre can range-request the world file.
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  // Load the recoloured basemap style. Default is OpenFreeMap (OpenMapTiles
  // schema, whole-planet, no key). To self-host Protomaps PMTiles later, point
  // bush.json at bush-protomaps.json and set BRM_CONFIG.tilesUrl to the R2 URL.
  const style = await fetch("styles/bush.json").then((r) => r.json());
  if (TILES_URL && style.sources.protomaps) {
    style.sources.protomaps.url = "pmtiles://" + TILES_URL;
  }

  // Open already framed on the pins (AU/NZ today, Hawaii soon) so the world
  // view never flashes. Falls back to a wide Australasia view if there are no
  // routes yet.
  const startBounds = routesBounds(routeFeatures);
  const mapOpts = {
    container: "map",
    style,
    hash: false,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
  };
  if (startBounds) {
    mapOpts.bounds = startBounds;
    mapOpts.fitBoundsOptions = { padding: fitPadding(), maxZoom: 13 };
  } else {
    mapOpts.center = [146, -28]; // eastern Australia
    mapOpts.zoom = 3.4;
  }

  map = new maplibregl.Map(mapOpts);
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.touchZoomRotate.disableRotation();

  map.on("load", onLoad);
}

function onLoad() {
  // --- Sources -------------------------------------------------------------
  // Clustered point source (pins). Clustering is on from day one so
  // ambassador-scale data later needs no rework.
  map.addSource("routes-points", {
    type: "geojson",
    data: pointsFC(routeFeatures),
    cluster: true,
    clusterRadius: 45,
    clusterMaxZoom: 11,
    promoteId: "id",
    // Sum each pin's route count so a cluster badge shows total routes, not
    // just the number of distinct start locations it covers.
    clusterProperties: { routeCount: ["+", ["get", "count"]] },
  });

  // Selected route LineString (drawn on click).
  map.addSource("selected-route", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  // --- Layers --------------------------------------------------------------
  map.addLayer({
    id: "selected-route-line",
    type: "line",
    source: "selected-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE_LINE, "line-width": 3 },
  });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "routes-points",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": SAGE,
      "circle-opacity": 0.9,
      "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 15, 26],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#f4efe2",
    },
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "routes-points",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["to-string", ["get", "routeCount"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
    },
    paint: { "text-color": "#2c2a24" },
  });

  map.addLayer({
    id: "unclustered",
    type: "circle",
    source: "routes-points",
    filter: ["!", ["has", "point_count"]],
    paint: {
      // Event pins are largest, then grouped trailhead pins, then singles.
      "circle-radius": [
        "case",
        ["==", ["get", "kind"], "series"], 11,
        ["boolean", ["feature-state", "selected"], false], 8,
        [">", ["get", "count"], 1], 9,
        6,
      ],
      // Selected → lemon; event/series → plum; everything else → olive.
      "circle-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false], LEMON,
        ["==", ["get", "kind"], "series"], SERIES,
        OLIVE,
      ],
      "circle-stroke-width": ["case", ["==", ["get", "kind"], "series"], 2.5, 2],
      "circle-stroke-color": "#f4efe2",
    },
  });

  // Count badge on grouped pins so "multiple routes here" is visible at a glance.
  map.addLayer({
    id: "route-count",
    type: "symbol",
    source: "routes-points",
    filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "count"], 1]],
    layout: {
      "text-field": ["to-string", ["get", "count"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": "#f4efe2" },
  });

  // Community Bush Ride event pins — added AFTER route layers so they render
  // above route lines and pins (always tappable when overlapping). Isolated so
  // an event-layer failure can never break the core route map.
  try {
    setupEventLayers();
  } catch (e) {
    console.error("Event layers failed to initialise; routes still work.", e);
  }

  mapReady = true;
  // The camera is already framed on the routes via the constructor's bounds;
  // no need to re-fit here (which caused a visible jump on load).
  wireInteractions();
  try {
    wireEventInteractions();
  } catch (e) {
    console.error("Event interactions failed to wire.", e);
  }

  // Sync pins to the current filter state, and (re)draw a selection made
  // before the map finished loading.
  refresh();
  if (selectedId) selectRoute(selectedId, false);

  // Non-invasive integration point for the optional diary layer (diary.js).
  // Exposes the map + a ready signal; changes nothing about the map itself.
  window.brmMap = map;
  window.brmMapReady = true;
  window.dispatchEvent(new CustomEvent("brm:mapready"));
}

// Rough metres between two [lng,lat] points (equirectangular — fine at pin scale).
function metersBetween(a, b) {
  const R = 6371000;
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dLat = (b[1] - a[1]) * (Math.PI / 180);
  const dLng = (b[0] - a[0]) * (Math.PI / 180) * Math.cos(lat);
  return R * Math.sqrt(dLat * dLat + dLng * dLng);
}
function centroid(coords) {
  let x = 0, y = 0;
  for (const c of coords) { x += c[0]; y += c[1]; }
  return [x / coords.length, y / coords.length];
}

// Build a points FeatureCollection from each route's marker (or line start).
// Two kinds of grouping collapse overlapping pins into one:
//   • Event / series (an explicit `series` name, e.g. "Clarkes Gambit"): every
//     route in the series shares ONE plum pin at the set's centre, regardless of
//     how spread out the starts are.
//   • Shared trailhead: remaining routes starting within ~50 m of each other
//     (e.g. a 50/95/135 km set) merge into one pin. Proximity — not coordinate
//     rounding — so GPS jitter at a start doesn't split the set.
// Either way the pin carries every member id so a click can offer a picker.
const SAME_START_M = 50;
function pointsFC(features) {
  const groups = []; // { coord?, coords:[], ids:[], name, series }
  const seriesByName = new Map(); // lowercased series -> group
  routeToPinId = new Map();

  for (const f of features) {
    const coord = f.properties.marker || f.geometry.coordinates[0];
    if (!coord) continue;
    const series = (f.properties.series || "").trim();
    if (series) {
      const key = series.toLowerCase();
      let g = seriesByName.get(key);
      if (!g) {
        g = { coords: [], ids: [], name: series, series };
        seriesByName.set(key, g);
        groups.push(g);
      }
      g.coords.push(coord);
      g.ids.push(f.properties.id);
    } else {
      let g = groups.find((x) => !x.series && metersBetween(x.coord, coord) <= SAME_START_M);
      if (!g) {
        g = { coord, coords: [coord], ids: [], name: f.properties.name, series: "" };
        groups.push(g);
      }
      g.ids.push(f.properties.id);
    }
  }

  const out = [];
  for (const g of groups) {
    const pinId = g.ids[0];
    for (const id of g.ids) routeToPinId.set(id, pinId);
    out.push({
      type: "Feature",
      // Series pin sits at its routes' centre; a trailhead/solo pin at its start.
      geometry: { type: "Point", coordinates: g.series ? centroid(g.coords) : g.coord },
      properties: {
        id: pinId,
        name: g.name,
        count: g.ids.length,
        ids: g.ids.join(","), // members, read on click to offer a picker
        series: g.series || "",
        kind: g.series ? "series" : "route",
      },
    });
  }
  return { type: "FeatureCollection", features: out };
}

function wireInteractions() {
  // Cluster click -> zoom to expansion.
  map.on("click", "clusters", (e) => {
    const feat = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
    const clusterId = feat.properties.cluster_id;
    map
      .getSource("routes-points")
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        map.easeTo({ center: feat.geometry.coordinates, zoom });
      });
  });

  // Pin click -> select the route, or offer a picker when several share the pin.
  map.on("click", "unclustered", (e) => {
    const props = e.features[0].properties;
    const ids = String(props.ids || props.id).split(",").filter(Boolean);
    if (ids.length <= 1) {
      selectRoute(ids[0] || props.id, true);
    } else {
      showRouteChooser(ids, e.features[0].geometry.coordinates, props.series || "");
    }
  });

  for (const layer of ["clusters", "unclustered", "route-count"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }

  // A grouped pin's count badge sits above the circle; make a tap on the number
  // behave like a tap on the pin.
  map.on("click", "route-count", (e) => {
    const props = e.features[0].properties;
    const ids = String(props.ids || props.id).split(",").filter(Boolean);
    showRouteChooser(ids, e.features[0].geometry.coordinates, props.series || "");
  });

  // Tap the bare map (not a pin/cluster/event/diary line) to dismiss the sheet.
  map.on("click", (e) => {
    if (!detailOpen) return;
    const hitLayers = ["unclustered", "clusters", "event-hit", "diary-lines"].filter((l) =>
      map.getLayer(l)
    );
    const hits = hitLayers.length ? map.queryRenderedFeatures(e.point, { layers: hitLayers }) : [];
    if (!hits.length) closeDetail();
  });
}

// ---- Community Bush Ride event pins --------------------------------------
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setupEventLayers() {
  if (!eventFeatures.length) return;

  map.addSource("community-events", {
    type: "geojson",
    data: eventsFC(),
    // No clustering: event pins always render individually.
  });

  // Outer pulse ring (upcoming only). Radius/opacity animated via rAF below;
  // under reduced motion it stays a static ring.
  map.addLayer({
    id: "event-pulse",
    type: "circle",
    source: "community-events",
    filter: ["==", ["get", "status"], "upcoming"],
    paint: {
      "circle-color": TERRACOTTA,
      "circle-radius": reduceMotion ? 20 : 14,
      "circle-opacity": reduceMotion ? 0.18 : 0.35,
      "circle-stroke-width": 0,
    },
  });

  // Inner filled anchor circle. Past events: muted grey at reduced opacity.
  map.addLayer({
    id: "event-core",
    type: "circle",
    source: "community-events",
    paint: {
      "circle-radius": 10,
      "circle-color": ["match", ["get", "status"], "past", EVENT_PAST, TERRACOTTA],
      "circle-opacity": ["match", ["get", "status"], "past", 0.4, 1],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": ["match", ["get", "status"], "past", 0.4, 1],
    },
  });

  // White flag icon centered on the core. Fall back to no icon (the filled
  // circle still reads as a pin) if the image can't be added.
  let hasIcon = false;
  try {
    if (!map.hasImage("event-flag")) map.addImage("event-flag", makeFlagIcon(), { pixelRatio: 2 });
    hasIcon = true;
  } catch (e) {
    console.warn("Event icon unavailable; using plain marker.", e.message);
  }
  if (hasIcon) {
    map.addLayer({
      id: "event-icon",
      type: "symbol",
      source: "community-events",
      layout: {
        "icon-image": "event-flag",
        "icon-size": 0.5,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": ["match", ["get", "status"], "past", 0.4, 1] },
    });
  }

  // Invisible, generously sized hit target so pins stay easy to tap even while
  // the pulse ring is mid-fade.
  map.addLayer({
    id: "event-hit",
    type: "circle",
    source: "community-events",
    paint: { "circle-radius": 22, "circle-color": TERRACOTTA, "circle-opacity": 0 },
  });

  startPulse();
}

// FeatureCollection for the event source (Point features, current status).
function eventsFC() {
  return {
    type: "FeatureCollection",
    features: eventFeatures.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { id: f.properties.id, status: f.properties.status || "upcoming" },
    })),
  };
}

// A small white flag drawn to a canvas, returned as ImageData for addImage.
function makeFlagIcon() {
  const s = 44; // 2x of ~22px
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d");
  x.strokeStyle = "#fff";
  x.fillStyle = "#fff";
  x.lineWidth = 3;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.beginPath(); // pole
  x.moveTo(16, 9);
  x.lineTo(16, 35);
  x.stroke();
  x.beginPath(); // pennant
  x.moveTo(16, 10);
  x.lineTo(34, 15.5);
  x.lineTo(16, 21);
  x.closePath();
  x.fill();
  return x.getImageData(0, 0, s, s);
}

// Pulse the outer ring: expand 14->28px and fade 0.35->0 over ~2s, looping.
// Under reduced motion we leave the static ring set above and do nothing.
function startPulse() {
  if (reduceMotion) return;
  if (!map.getLayer("event-pulse")) return;
  const PERIOD = 2000;
  const t0 = performance.now();
  (function frame(now) {
    if (!map.getLayer("event-pulse")) return; // layer gone (e.g. teardown)
    if (!document.hidden) {
      const t = ((now - t0) % PERIOD) / PERIOD; // 0..1
      map.setPaintProperty("event-pulse", "circle-radius", 14 + 14 * t);
      map.setPaintProperty("event-pulse", "circle-opacity", 0.35 * (1 - t));
    }
    requestAnimationFrame(frame);
  })(t0);
}

function wireEventInteractions() {
  // Bind to the invisible hit target plus the visible core/icon, so a tap
  // registers regardless of where the pulse ring happens to be mid-animation.
  const layers = ["event-hit", "event-core", "event-icon"].filter((l) => map.getLayer(l));
  if (!layers.length) return;
  map.on("click", layers, (e) => {
    const id = e.features[0].properties.id;
    const feature = eventById.get(id);
    if (feature) openEventDetail(feature);
  });
  map.on("mouseenter", layers, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", layers, () => (map.getCanvas().style.cursor = ""));
}

// ---- Selection -----------------------------------------------------------
function selectRoute(id, fly) {
  const feature = routeById.get(id);
  if (!feature) return;

  if (mapReady) {
    // Clear previous selected pin state. Highlight the *pin*, which may be shared
    // by several routes at one start — routeToPinId maps a route to its pin.
    if (selectedId) {
      map.setFeatureState({ source: "routes-points", id: routeToPinId.get(selectedId) || selectedId }, { selected: false });
    }
    map.setFeatureState({ source: "routes-points", id: routeToPinId.get(id) || id }, { selected: true });

    // Draw the LineString.
    map.getSource("selected-route").setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: feature.geometry, properties: {} }],
    });
  }

  selectedId = id;
  // Selecting from the results list on a phone leaves the filters drawer over
  // the map; collapse it so the map + detail sheet are visible.
  collapseSidebarOnMobile();
  // openDetail opens the sheet at peek and frames the route above it (with the
  // correct dynamic padding). Framing here would use stale padding, so we let
  // the sheet own the camera.
  openDetail(feature);
  highlightResult(id);
}

function clearSelection() {
  if (mapReady) {
    if (selectedId) {
      map.setFeatureState({ source: "routes-points", id: routeToPinId.get(selectedId) || selectedId }, { selected: false });
    }
    map.getSource("selected-route").setData({ type: "FeatureCollection", features: [] });
  }
  selectedId = null;
}

// Several routes share a pin — an event/series (title set) or a shared trailhead
// (no title). Pop a small picker so any of them can be opened. One route -> just
// open it.
function showRouteChooser(ids, lngLat, title) {
  const routes = ids.map((id) => routeById.get(id)).filter(Boolean);
  if (routes.length <= 1) {
    if (routes[0]) selectRoute(routes[0].properties.id, true);
    return;
  }
  if (routeChooserPopup) routeChooserPopup.remove();

  const wrap = document.createElement("div");
  wrap.className = "route-chooser" + (title ? " route-chooser--event" : "");
  if (title) {
    const eyebrow = document.createElement("p");
    eyebrow.className = "route-chooser__eyebrow";
    eyebrow.textContent = "Famous ride";
    wrap.appendChild(eyebrow);
  }
  const head = document.createElement("p");
  head.className = "route-chooser__head";
  head.textContent = title || "Routes from here";
  wrap.appendChild(head);
  const sub = document.createElement("p");
  sub.className = "route-chooser__sub";
  sub.textContent = `${routes.length} routes — tap to open`;
  wrap.appendChild(sub);

  for (const r of routes) {
    const p = r.properties;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "route-pick";
    const nm = document.createElement("span");
    nm.className = "route-pick__name";
    nm.textContent = p.name || "Route";
    const meta = document.createElement("span");
    meta.className = "route-pick__meta";
    meta.textContent = [
      p.distance_km != null ? `${fmt(p.distance_km)} km` : "",
      terrainLabel(p.terrain_difficulty),
    ]
      .filter(Boolean)
      .join(" · ");
    btn.append(nm, meta);
    btn.addEventListener("click", () => {
      if (routeChooserPopup) routeChooserPopup.remove();
      selectRoute(p.id, true);
    });
    wrap.appendChild(btn);
  }

  routeChooserPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    maxWidth: "260px",
    className: "route-chooser-popup" + (title ? " is-event" : ""),
    offset: 12,
  })
    .setLngLat(lngLat)
    .setDOMContent(wrap)
    .addTo(map);
  routeChooserPopup.on("close", () => {
    routeChooserPopup = null;
  });
}

// ---- Bounds --------------------------------------------------------------
// Padding that keeps the framed route clear of whatever UI is currently
// overlaying the map. In sheet mode (mobile/tablet) the detail surface rises
// from the bottom, so we reserve its *visible* height so the selected route
// stays readable above it. On desktop the filters sit left and the inset
// detail panel sits right, so we reserve those edges instead.
function fitPadding() {
  const vw = window.innerWidth;
  const vh = viewportHeight();

  if (vw <= 720) {
    // Phone: filters are an overlay (closed by default) and the detail sheet
    // rises full-width from the bottom. Reserve only its visible height.
    const reserve = detailOpen && sheetState !== "full" ? sheetVisibleHeight() + 20 : 40;
    return {
      top: 64,
      bottom: Math.min(reserve, Math.round(vh * 0.55)),
      left: 28,
      right: 28,
    };
  }

  if (vw <= 1024) {
    // Tablet: the filters sidebar is docked on the left; the detail sheet is a
    // bottom-right corner sheet. Reserve both.
    const reserve = detailOpen && sheetState !== "full" ? sheetVisibleHeight() + 20 : 40;
    return {
      top: 60,
      bottom: Math.min(reserve, Math.round(vh * 0.55)),
      left: 360,
      right: 40,
    };
  }

  // Desktop: filters sidebar left; inset floating detail panel bottom-right.
  // Reserve the right edge for the panel so the route stays clear of it. The
  // event panel is wider (440px) than the route panel (380px), so it needs a
  // deeper reserve or the route line slips under the card.
  return {
    top: 60,
    bottom: 60,
    left: 380,
    right: detailOpen ? (detailMode === "event" ? 500 : 430) : 80,
  };
}

// LngLatBounds covering every route, or null if there are none.
function routesBounds(features) {
  const bounds = new maplibregl.LngLatBounds();
  for (const f of features) {
    for (const c of f.geometry.coordinates) bounds.extend(c);
  }
  return bounds.isEmpty() ? null : bounds;
}

function fitToRoutes(features, animate) {
  const bounds = routesBounds(features);
  if (!bounds) return;
  map.fitBounds(bounds, { padding: fitPadding(), animate, maxZoom: 13 });
}

// ---- Detail surface: responsive sheet / panel ----------------------------
// Mobile & tablet: a draggable bottom sheet with peek / half / full snap
// states. Desktop: an inset floating panel that opens fully. One shared DOM
// node (#detail) drives all breakpoints so only ever one surface is open.

// Snap states used in sheet mode. Desktop opens straight to "full".
let detailOpen = false;
let detailMode = "route"; // "route" | "event"
let sheetState = "closed"; // "closed" | "peek" | "half" | "full"
let drag = null; // active pointer-drag session
let reframeTimer = null;

const els = {}; // cached detail nodes (populated in setupDetailPanel)

// Sheet mode = anything up to tablet width. Above that we use the desktop
// inset panel and disable dragging.
function isSheetMode() {
  return window.matchMedia("(max-width: 1024px)").matches;
}

function viewportHeight() {
  return (window.visualViewport && window.visualViewport.height) || window.innerHeight;
}

// Visible heights (px, measured up from the bottom edge) for each snap state.
// Peek is measured from the natural height of the drag zone so the primary
// action is always fully visible; half/full are viewport fractions.
function snapHeights() {
  const vh = viewportHeight();
  const full = els.detail.offsetHeight || Math.round(vh * 0.9);
  const peekNatural = (els.drag ? els.drag.offsetHeight : 210) + 8;
  const half = Math.round(vh * 0.6);
  return {
    peek: Math.min(peekNatural, half),
    half,
    full,
  };
}

function sheetVisibleHeight() {
  if (!detailOpen || sheetState === "closed") return 0;
  return snapHeights()[sheetState] || 0;
}

// translateY (px) that leaves `state`'s visible height showing.
function translateForState(state) {
  const full = els.detail.offsetHeight;
  return Math.max(0, full - (snapHeights()[state] || 0));
}

function currentTranslateY() {
  const t = getComputedStyle(els.detail).transform;
  if (!t || t === "none") return 0;
  const m = new DOMMatrixReadOnly(t);
  return m.m42;
}

function setupDetailPanel() {
  els.detail = document.getElementById("detail");
  els.drag = document.getElementById("detail-drag");
  els.scroll = document.getElementById("detail-scroll");

  document.getElementById("detail-close").addEventListener("click", closeDetail);

  // Pointer-drag on the handle / header zone drives the snap states. We ignore
  // presses that begin on a control (close, download) so taps still fire.
  els.drag.addEventListener("pointerdown", onDragStart);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);

  // Keep the sheet aligned when the layout mode flips or the mobile viewport
  // resizes (URL bar show/hide changes the snap maths).
  let lastMode = isSheetMode();
  window.addEventListener("resize", () => {
    const mode = isSheetMode();
    if (mode !== lastMode) {
      lastMode = mode;
      resyncSurfaceForMode();
    }
    if (detailOpen && selectedId) scheduleReframe();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (detailOpen && isSheetMode() && sheetState !== "closed" && !drag) {
        applySheetState(sheetState, false);
      }
    });
  }
}

// Move the sheet to a snap state (sheet mode only). Desktop ignores translateY.
function applySheetState(state, animate = true) {
  const y = state === "closed" ? "100%" : translateForState(state) + "px";
  els.detail.style.transition = animate ? "" : "none";
  els.detail.style.transform = `translateY(${y})`;
  if (!animate) {
    // Force reflow so the next transition (a real drag/settle) animates.
    void els.detail.offsetHeight;
    els.detail.style.transition = "";
  }
}

function setSheetState(state, { animate = true, reframe = true } = {}) {
  sheetState = state;
  els.detail.dataset.state = state;
  if (isSheetMode()) applySheetState(state, animate);
  // Re-frame in peek/half so the route stays visible above the sheet. In full
  // the sheet covers the map, so re-framing is pointless — leave the camera.
  if (reframe && state !== "closed" && state !== "full") scheduleReframe();
}

function openDetail(feature) {
  detailMode = "route";
  els.detail.dataset.mode = "route";
  els.detail.removeAttribute("data-event-status");
  fillDetail(feature);
  // Route detail opens at peek (browsing), event detail opens at half.
  openSheet("peek");
}

// Open a Community Bush Ride event in the same sheet, with event content and
// opening straight to half state (events need quicker decision-making).
function openEventDetail(feature) {
  detailMode = "event";
  els.detail.dataset.mode = "event";
  fillEventDetail(feature);

  // Show the linked route on the map (the sheet frames it). We reuse the
  // selected-route line but don't highlight a route pin, so the event stays
  // the focus. selectedId drives re-framing as the sheet snaps.
  const route = routeById.get(feature.properties.route_id);
  selectedId = route ? route.properties.id : null;
  if (mapReady) {
    map.getSource("selected-route").setData(
      route
        ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: route.geometry, properties: {} }] }
        : { type: "FeatureCollection", features: [] }
    );
  }
  // Open compact (peek): the card shows title → CTA without the hero, so the
  // route stays visible on the map. Sliding to full reveals the hero + detail.
  openSheet("peek");
}

// Shared open logic for both content modes.
function openSheet(initialState) {
  const first = !detailOpen;
  detailOpen = true;
  els.detail.classList.add("is-open");
  els.detail.setAttribute("aria-hidden", "false");

  if (isSheetMode()) {
    if (first) {
      applySheetState("closed", false); // start off-screen
      requestAnimationFrame(() => setSheetState(initialState));
    } else {
      setSheetState(initialState);
    }
  } else {
    // Desktop inset panel: no translateY, CSS handles the slide-in.
    els.detail.style.transform = "";
    sheetState = "full";
    els.detail.dataset.state = "full";
    scheduleReframe();
  }
}

function closeDetail() {
  if (!detailOpen) return;
  detailOpen = false;
  clearSelection();
  highlightResult(null);
  els.detail.setAttribute("aria-hidden", "true");

  if (isSheetMode()) {
    setSheetState("closed", { reframe: false });
    onTransitionEndOnce(els.detail, () => {
      if (!detailOpen) els.detail.classList.remove("is-open");
    });
  } else {
    els.detail.classList.remove("is-open");
    els.detail.style.transform = "";
  }
  sheetState = "closed";
  els.detail.dataset.state = "closed";
}

// ---- Card fill (shared redesigned card for routes and events) ------------

// Route detail. The route feature carries all the numbers itself.
function fillDetail(feature) {
  const p = feature.properties;
  setCardHero(p.photo_url, p.name);
  setChip(p.surface);
  setText("detail-eyebrow", "Community route");
  setText("detail-name", p.name || "");
  setPill(p.terrain_difficulty, p.distance_km, p.elevation_gain_m);
  setStats(p);
  setStart("Area", [p.region, p.state].filter(Boolean).join(", "), routeStartNav(feature));
  // Card shows a short preview; the full write-up lives on the route page. When
  // it's clamped, offer a "Continue reading" link through to that page.
  setCardDescription(p);
  setCredit(p.contributed_by || p.vetted_by, p.contributor_url);
  setText("detail-disclaimer", "A guide only — ride to conditions.");
  // Prominent action: the full write-up page. Secondary: Download GPX (gated).
  els.detail.querySelector("#detail-page-cta").href = routePageUrl(p);
  setCTA("Download GPX", null, () => requestDownload({ id: p.id, gpx_url: p.gpx_url }));
  drawElevation(feature);
  // Reviews + aggregate rating (async; enhancement only).
  if (window.brmReviews) window.brmReviews.show(p.id, p.name);
}

// Community Bush Ride event. The numbers come from the linked route; the event
// adds the date, pace, meeting point, "keen" count and Strava action. Past
// events render read-only (data-event-status hides .for-upcoming, shows .for-past).
function fillEventDetail(feature) {
  const p = feature.properties;
  const route = routeById.get(p.route_id);
  const rp = route ? route.properties : {};
  els.detail.dataset.eventStatus = p.status === "past" ? "past" : "upcoming";

  setCardHero(resolveHero(p.hero_image) || rp.photo_url || "", p.subtitle || p.name, rp.photo_url);
  setChip(rp.surface);
  setText("detail-eyebrow", "Community bush ride");
  setText("detail-keen-text", `${p.interested_count ?? 0} keen`);
  setText("detail-name", p.subtitle || "");
  setText("detail-when", [p.date_display, p.time].filter(Boolean).join(" · "));
  setText("detail-vibe", p.pace || "");
  setStats(rp);
  setStart("Start", p.meeting_point || "", eventStartNav(feature));
  setText("detail-description", p.description || "");
  setText("detail-kit", p.kit_note || "");
  // Credit the linked route's contributor.
  setCredit(rp.contributed_by || rp.vetted_by, rp.contributor_url);
  setText("detail-disclaimer", "Community ride — ride to conditions.");
  // Events don't carry route reviews in the card; clear any prior state.
  if (window.brmReviews) window.brmReviews.reset();

  // Past events read-only: the CTA hides (CSS via data-event-status) and this
  // line takes its place.
  setText("detail-happened", p.status === "past" ? "This ride has already happened." : "");

  // Primary: Join on Strava (real link). Secondary: download the route GPX.
  setCTA("Join the ride on Strava", p.strava_url || "#");
  const gpx2 = els.detail.querySelector("#detail-gpx2");
  if (route && rp.gpx_url) {
    gpx2.style.display = "";
    gpx2.onclick = () => requestDownload({ id: rp.id, gpx_url: rp.gpx_url });
  } else {
    gpx2.style.display = "none";
  }

  drawElevation(route);
}

// ---- Card field helpers --------------------------------------------------
function setCardHero(src, alt, fallbackSrc) {
  const hero = els.detail.querySelector("#detail-photo");
  hero.dataset.fellback = "";
  hero.onload = () => (hero.hidden = false);
  hero.onerror = () => {
    if (!hero.dataset.fellback && fallbackSrc && fallbackSrc !== hero.getAttribute("src")) {
      hero.dataset.fellback = "1";
      hero.src = fallbackSrc;
    } else {
      hero.hidden = true; // leave the sage hero block
    }
  };
  hero.alt = alt || "";
  if (src) {
    hero.hidden = false;
    hero.src = src;
  } else {
    hero.removeAttribute("src");
    hero.hidden = true;
  }
}

// Hero chip: the surface material at a glance ("Gravel"). Terrain + effort now
// live in the header pill, so the chip carries just the one word.
function setChip(surface) {
  const chip = els.detail.querySelector(".card__chip");
  const s = surface ? shortSurface(surface) : "";
  setText("detail-chip-surface", s);
  setText("detail-chip-diff", "");
  chip.querySelector(".card__chip-dot").style.display = "none";
  chip.classList.toggle("is-empty", !s);
}

function setStats(p) {
  setStat("detail-distance", Number.isFinite(+p.distance_km) ? fmt(p.distance_km) : "—", "km");
  setStat("detail-climb", Number.isFinite(+p.elevation_gain_m) ? fmt(p.elevation_gain_m) : "—", "m");
}

// Header descriptor pill: "Terrain · Effort" (e.g. "Rocky · Big day out").
// Terrain is contributor-chosen; effort is derived from the ride's numbers.
function setPill(terrain, distKm, elevM) {
  const pill = els.detail.querySelector("#detail-pill");
  const eff = computeEffort(distKm, elevM);
  const parts = [terrainLabel(terrain), eff && eff.label].filter(Boolean);
  if (!parts.length) {
    pill.style.display = "none";
    return;
  }
  pill.style.display = "";
  pill.innerHTML = "";
  parts.forEach((txt, i) => {
    if (i) {
      const dot = document.createElement("i");
      dot.className = "card__pill-dot";
      dot.setAttribute("aria-hidden", "true");
      pill.appendChild(dot);
    }
    const span = document.createElement("span");
    span.textContent = txt;
    pill.appendChild(span);
  });
}

// Contributor credit + optional "Check them out" link (Strava / RWGPS / site).
function setCredit(name, url) {
  const wrap = els.detail.querySelector("#detail-credit");
  const nm = (name || "").trim();
  if (!nm) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";
  setText("detail-credit-name", nm);
  const link = els.detail.querySelector("#detail-credit-link");
  const u = (url || "").trim();
  if (u && /^https?:\/\//i.test(u)) {
    link.href = u;
    link.style.display = "";
  } else {
    link.style.display = "none";
  }
}

function setStat(id, value, unit) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = String(value);
  if (unit && value !== "—") {
    const u = document.createElement("span");
    u.className = "card__unit";
    u.textContent = " " + unit;
    el.appendChild(u);
  }
}

function setStart(label, name, navHref) {
  setText("detail-start-label", label);
  setText("detail-start", name || "—");
  const nav = els.detail.querySelector("#detail-navigate");
  if (navHref) {
    nav.href = navHref;
    nav.style.display = "";
  } else {
    nav.style.display = "none";
  }
}

// Primary CTA. Pass href for a real link (event → Strava); pass onclick for a
// JS action (route → gated GPX download).
function setCTA(label, href, onclick) {
  const cta = els.detail.querySelector("#detail-cta");
  cta.textContent = label;
  if (href != null) {
    cta.href = href;
    cta.onclick = null;
  } else {
    cta.href = "#";
    cta.onclick = (e) => {
      e.preventDefault();
      if (onclick) onclick();
    };
  }
}

function fmt(n) {
  return Math.round(+n).toLocaleString("en-US");
}

// Terrain vocabulary (Groomed / Rocky / Proper Mud). Legacy easy/moderate/hard
// rows map on so routes added before the rename still label correctly.
const TERRAIN_LABEL = {
  groomed: "Groomed",
  rocky: "Rocky",
  "proper-mud": "Proper Mud",
  easy: "Groomed",
  moderate: "Rocky",
  hard: "Proper Mud",
};
function terrainLabel(v) {
  const s = String(v || "").toLowerCase();
  return TERRAIN_LABEL[s] || (v ? cap(v) : "");
}

// Effort derived from the ride's distance + climb — no stored value, so it's
// filled in for every route on the map, including ones added before this.
//   Cruisy            < 75 km and < 750 m
//   Big day out       75–120 km and/or 751 m+
//   Character building above big-day-out distance AND climb
function computeEffort(distKm, elevM) {
  const d = +distKm;
  const e = +elevM;
  if (!Number.isFinite(d) && !Number.isFinite(e)) return null;
  const longRide = d > 120;
  const bigClimb = e > 750;
  if (longRide && bigClimb) return { slug: "character-building", label: "Character building" };
  if (d >= 75 || bigClimb) return { slug: "big-day-out", label: "Big day out" };
  return { slug: "cruisy", label: "Cruisy" };
}
// Reduce a verbose surface string ("92% gravel, 8% sealed") to its primary
// material word ("Gravel") for the stat cell / hero chip.
function shortSurface(s) {
  const m = String(s).match(/[a-zA-Z]+/);
  return m ? cap(m[0]) : "—";
}
// iPhone/iPad (incl. iPadOS, which reports as "Macintosh" + touch) — but not
// Mac desktops. Matches the "on iPhone" behaviour of the static route pages.
function isIOS() {
  const ua = navigator.userAgent || "";
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
function navUrl(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return isIOS()
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
function routeStartNav(feature) {
  const m = feature.properties.marker || (feature.geometry && feature.geometry.coordinates[0]);
  return m ? navUrl(m[1], m[0]) : "";
}
function eventStartNav(feature) {
  const c = feature.geometry && feature.geometry.coordinates;
  return c ? navUrl(c[1], c[0]) : "";
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// URL of a route's static write-up page. MUST mirror the slug logic in
// scripts/generate-route-pages.js so the card link and the generated file match.
function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
// Trim a long write-up to a card-sized preview at a word boundary.
function clampText(s, max) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

// Fill the route card's description with a short preview. If the write-up is
// longer than the preview, append a subtle "Continue reading" link to the
// route's full page so riders can get the whole thing.
function setCardDescription(p) {
  const el = document.getElementById("detail-description");
  const full = String(p.description || "").replace(/\s+/g, " ").trim();
  const preview = clampText(full, 220);
  el.textContent = preview;
  if (preview !== full) {
    el.appendChild(document.createTextNode(" "));
    const a = document.createElement("a");
    a.className = "card__desc-more";
    a.href = routePageUrl(p);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Continue reading";
    el.appendChild(a);
  }
}
function routePageUrl(p) {
  let state = (p.state || "").trim();
  let region = (p.region || "").trim();
  if (!state) {
    const m = region.match(/,\s*([A-Za-z]{2,3})\s*$/);
    if (m) {
      state = m[1];
      region = region.replace(/,\s*[A-Za-z]{2,3}\s*$/, "").trim();
    }
  }
  const ss = slugify(state) || "au";
  const rs = slugify(region) || "other";
  return `/routes/${ss}/${rs}/${p.id}`;
}

// ---- Route elevation profile ---------------------------------------------
const elevCache = new Map(); // route id -> profile [{d, e}] | null

// Fetch the linked route's GPX, parse an elevation profile, and draw it. Falls
// back to a clear "unavailable" note if the GPX has no elevation (e.g. some
// curated tracks) or can't be fetched.
async function drawElevation(route) {
  const svg = els.detail.querySelector("#detail-elev-svg");
  const note = els.detail.querySelector("#detail-elev-note");
  const empty = els.detail.querySelector("#detail-elev-empty");
  if (!svg) return;
  clearElevSvg(svg); // keep the <defs> gradient, drop old paths
  if (note) note.textContent = "";
  if (empty) empty.hidden = true;

  const url = route && route.properties && route.properties.gpx_url;
  if (!url) return showElevUnavailable(svg, empty);

  const key = route.properties.id;
  const token = key; // guard against a later selection resolving first
  els.detail.dataset.elevToken = token;

  let profile = elevCache.get(key);
  if (profile === undefined) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      profile = res.ok ? parseElevation(await res.text()) : null;
    } catch {
      profile = null;
    }
    elevCache.set(key, profile);
  }
  // If the user opened a different event while we were fetching, don't draw.
  if (els.detail.dataset.elevToken !== token) return;
  if (!profile) return showElevUnavailable(svg, empty);
  renderElevation(svg, profile, note, route.properties);
}

// Total ascent (positive elevation deltas) over the profile. Elevations are
// lightly smoothed first because raw GPS elevation is noisy and would otherwise
// inflate the gain. Used only if the route's own elevation_gain_m is missing.
function computeGain(profile) {
  const e = profile.map((p) => p.e);
  const win = 2;
  const sm = e.map((_, i) => {
    const s = Math.max(0, i - win);
    const t = Math.min(e.length, i + win + 1);
    let a = 0;
    for (let j = s; j < t; j++) a += e[j];
    return a / (t - s);
  });
  let gain = 0;
  for (let i = 1; i < sm.length; i++) {
    const d = sm[i] - sm[i - 1];
    if (d > 0) gain += d;
  }
  return gain;
}

function showElevUnavailable(svg, empty) {
  if (svg) svg.style.display = "none";
  if (empty) empty.hidden = false;
}

// Remove drawn paths but preserve the static <defs> gradient in the markup.
function clearElevSvg(svg) {
  Array.from(svg.children).forEach((c) => {
    if (c.tagName.toLowerCase() !== "defs") c.remove();
  });
}

// Parse GPX <trkpt> lat/lon/ele into a cumulative-distance elevation profile.
function parseElevation(gpxText) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(gpxText, "application/xml");
  } catch {
    return null;
  }
  const pts = doc.getElementsByTagName("trkpt");
  if (!pts.length) return null;
  const out = [];
  let prev = null;
  let dist = 0;
  let hasEle = false;
  for (let i = 0; i < pts.length; i++) {
    const lat = parseFloat(pts[i].getAttribute("lat"));
    const lon = parseFloat(pts[i].getAttribute("lon"));
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (prev) dist += haversineKm(prev, [lon, lat]);
    prev = [lon, lat];
    const eleEl = pts[i].getElementsByTagName("ele")[0];
    const ele = eleEl ? parseFloat(eleEl.textContent) : NaN;
    if (isFinite(ele)) {
      hasEle = true;
      out.push({ d: dist, e: ele });
    }
  }
  if (!hasEle || out.length < 2) return null;
  // Downsample to keep the SVG light.
  const MAX = 160;
  if (out.length <= MAX) return out;
  const step = out.length / MAX;
  const ds = [];
  for (let i = 0; i < MAX; i++) ds.push(out[Math.floor(i * step)]);
  ds.push(out[out.length - 1]);
  return ds;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Render the profile as a filled area + line into the design's 340x54 viewBox
// (gradient fill + rust stroke). The caption reports total elevation GAINED
// (ascent) — a far better read on how hard a ride is than the peak height.
// Prefer the route's own elevation_gain_m (computed from the full track),
// falling back to the profile if absent.
function renderElevation(svg, profile, note, props) {
  svg.style.display = "";
  const NS = "http://www.w3.org/2000/svg";
  const W = 340, top = 4, base = 52; // 54-tall viewBox, 2px breathing room below
  const dMax = profile[profile.length - 1].d || 1;
  const es = profile.map((p) => p.e);
  let eMin = Math.min(...es);
  let eMax = Math.max(...es);
  if (eMax - eMin < 10) eMax = eMin + 10; // give a near-flat route some shape
  const x = (d) => (d / dMax) * W;
  const y = (e) => base - ((e - eMin) / (eMax - eMin)) * (base - top);
  const pts = profile.map((p) => `${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`);
  const line = "M" + pts.join(" L");
  const area = `M0,${base} L${pts.join(" L")} L${W},${base} Z`;

  const areaEl = document.createElementNS(NS, "path");
  areaEl.setAttribute("d", area);
  areaEl.setAttribute("fill", "url(#elevGrad)");
  const lineEl = document.createElementNS(NS, "path");
  lineEl.setAttribute("d", line);
  lineEl.setAttribute("fill", "none");
  lineEl.setAttribute("stroke", "#bd5730");
  lineEl.setAttribute("stroke-width", "1.6");
  lineEl.setAttribute("stroke-linejoin", "round");
  svg.appendChild(areaEl);
  svg.appendChild(lineEl);

  const gain =
    props && Number.isFinite(+props.elevation_gain_m) ? +props.elevation_gain_m : computeGain(profile);
  const dist = props && Number.isFinite(+props.distance_km) ? +props.distance_km : dMax;
  if (note) note.textContent = `↑ ${fmt(gain)} m over ${fmt(dist)} km`;
}

// ---- Drag gesture (sheet mode) -------------------------------------------
function onDragStart(e) {
  if (!isSheetMode() || !detailOpen) return;
  // Let taps on controls (close, download, route pill, Strava CTA) through.
  if (e.target.closest("button, a")) return;
  // In full state the content scrolls natively; only start a drag if the
  // scroller is already at the top (so a downward drag can collapse it).
  if (sheetState === "full" && els.scroll.scrollTop > 0) return;
  drag = {
    id: e.pointerId,
    startY: e.clientY,
    startT: currentTranslateY(),
    lastY: e.clientY,
    lastT: performance.now(),
    v: 0,
    active: false,
  };
  els.detail.style.transition = "none";
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.startY;
  if (!drag.active) {
    if (Math.abs(dy) < 4) return; // ignore micro-movement so taps still work
    drag.active = true;
    try {
      els.drag.setPointerCapture(drag.id);
    } catch (_) {}
  }
  const full = els.detail.offsetHeight;
  const t = Math.min(Math.max(drag.startT + dy, 0), full);
  els.detail.style.transform = `translateY(${t}px)`;
  const now = performance.now();
  drag.v = (e.clientY - drag.lastY) / Math.max(1, now - drag.lastT); // px/ms, + = down
  drag.lastY = e.clientY;
  drag.lastT = now;
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const { active, v } = drag;
  drag = null;
  els.detail.style.transition = "";
  if (!active) return; // it was a tap, not a drag

  const t = currentTranslateY();
  const full = els.detail.offsetHeight;
  const h = snapHeights();
  const yPeek = full - h.peek;
  const yHalf = full - h.half;
  const yFull = 0;

  // A firm downward flick, or dragging well below peek, dismisses the sheet.
  if (v > 0.7 || t > yPeek + 64) {
    if (t > yHalf) return closeDetail();
  }

  // Snap to the nearest state, then bias by flick direction for a natural feel.
  const cands = [
    ["full", yFull],
    ["half", yHalf],
    ["peek", yPeek],
  ];
  let best = cands[0];
  for (const c of cands) {
    if (Math.abs(c[1] - t) < Math.abs(best[1] - t)) best = c;
  }
  let state = best[0];
  if (v < -0.5) state = state === "peek" ? "half" : "full";
  else if (v > 0.5) state = state === "full" ? "half" : state === "half" ? "peek" : "peek";
  setSheetState(state);
}

// When the viewport crosses the sheet/desktop boundary, reset positioning so
// inline translateY from one mode doesn't leak into the other.
function resyncSurfaceForMode() {
  els.detail.style.transition = "none";
  if (detailOpen) {
    if (isSheetMode()) {
      els.detail.style.transform = "";
      // Both modes open compact at peek; the event card just carries more.
      setSheetState("peek", { animate: false });
    } else {
      els.detail.style.transform = "";
      sheetState = "full";
      els.detail.dataset.state = "full";
    }
  } else {
    els.detail.style.transform = "";
  }
  void els.detail.offsetHeight;
  els.detail.style.transition = "";
}

function scheduleReframe() {
  clearTimeout(reframeTimer);
  reframeTimer = setTimeout(() => {
    if (mapReady && selectedId) fitToRoutes([routeById.get(selectedId)], true);
  }, 60);
}

function onTransitionEndOnce(el, fn) {
  const handler = (ev) => {
    if (ev.target !== el) return;
    el.removeEventListener("transitionend", handler);
    fn();
  };
  el.addEventListener("transitionend", handler);
}

// ---- Results list + filter refresh --------------------------------------
function refresh() {
  const filtered = applyFilters(routeFeatures);
  if (mapReady) map.getSource("routes-points").setData(pointsFC(filtered));
  renderResults(filtered);
  // If the selected route fell out of the filter, drop the selection and close
  // the detail surface. Event sheets are exempt — events aren't filtered, and
  // an open event may reference a route that the current filter excludes.
  if (
    detailMode === "route" &&
    selectedId &&
    !filtered.some((f) => f.properties.id === selectedId)
  ) {
    closeDetail();
  }
}

function renderResults(features) {
  const count = document.getElementById("results-count");
  count.textContent = `${features.length} route${features.length === 1 ? "" : "s"}`;

  const list = document.getElementById("results-list");
  list.innerHTML = "";
  for (const f of features) {
    const p = f.properties;
    const li = document.createElement("li");
    li.className = "result";
    li.dataset.id = p.id;
    if (p.id === selectedId) li.classList.add("is-active");
    li.innerHTML = `
      <p class="result__name"></p>
      <p class="result__meta"></p>`;
    li.querySelector(".result__name").textContent = p.name;
    li.querySelector(".result__meta").textContent =
      [`${p.distance_km} km`, terrainLabel(p.terrain_difficulty), [p.region, p.state].filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · ");
    li.addEventListener("click", () => selectRoute(p.id, true));
    list.appendChild(li);
  }
}

function highlightResult(id) {
  document.querySelectorAll(".result").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.id === id);
  });
}

// ---- Sidebar toggle (mobile) --------------------------------------------
let setSidebarOpen = () => {}; // assigned in setupSidebarToggle

function setupSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  const close = document.getElementById("sidebar-close");
  // is-open drives the mobile drawer; is-closed collapses the docked panel on
  // tablet/desktop. They're mutually exclusive. body.sidebar-open lets the map
  // nav hide while the mobile drawer is up.
  setSidebarOpen = (open) => {
    sidebar.classList.toggle("is-open", open);
    sidebar.classList.toggle("is-closed", !open);
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("sidebar-open", open);
  };
  const isOpen = () => sidebar.classList.contains("is-open") || (!sidebar.classList.contains("is-closed") && window.matchMedia("(min-width: 721px)").matches);
  toggle.addEventListener("click", () => setSidebarOpen(!isOpen()));
  if (close) close.addEventListener("click", () => setSidebarOpen(false));

  // Docked open on tablet/desktop; closed on phones so the map shows first.
  // no-anim during init avoids a slide on load.
  sidebar.classList.add("no-anim");
  setSidebarOpen(window.matchMedia("(min-width: 721px)").matches);
  requestAnimationFrame(() => sidebar.classList.remove("no-anim"));
}

// On phones the filters drawer overlays the map, so collapse it when a route
// is picked — otherwise the drawer covers the map and the new detail sheet.
// Only applies in the mobile overlay range; the docked sidebar (tablet/desktop)
// doesn't block anything and stays put.
function collapseSidebarOnMobile() {
  if (window.matchMedia("(max-width: 720px)").matches) setSidebarOpen(false);
}

// ---- Helpers -------------------------------------------------------------
function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
