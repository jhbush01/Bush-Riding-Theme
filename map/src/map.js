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

let map;
let mapReady = false;
let routeFeatures = []; // full LineString features
const routeById = new Map();
let selectedId = null;
let requestDownload; // from gate

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

// Wire everything that does NOT depend on the map being up.
function initUI() {
  requestDownload = setupGate();
  setupFilters(routeFeatures, refresh);
  setupDetailPanel();
  setupSidebarToggle();
  renderResults(applyFilters(routeFeatures));

  // Deep link: /map#<route-id> (e.g. from the landing page's featured card)
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

  map = new maplibregl.Map({
    container: "map",
    style,
    hash: false,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
  });
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
      "text-field": ["get", "point_count_abbreviated"],
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
      "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 6],
      "circle-color": ["case", ["boolean", ["feature-state", "selected"], false], LEMON, OLIVE],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#f4efe2",
    },
  });

  mapReady = true;
  fitToRoutes(routeFeatures, false);
  wireInteractions();

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

// Build a points FeatureCollection from each route's marker (or line start).
function pointsFC(features) {
  return {
    type: "FeatureCollection",
    features: features.map((f) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: f.properties.marker || f.geometry.coordinates[0],
      },
      properties: { id: f.properties.id, name: f.properties.name },
    })),
  };
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

  // Pin click -> select route.
  map.on("click", "unclustered", (e) => {
    const id = e.features[0].properties.id;
    selectRoute(id, true);
  });

  for (const layer of ["clusters", "unclustered"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }
}

// ---- Selection -----------------------------------------------------------
function selectRoute(id, fly) {
  const feature = routeById.get(id);
  if (!feature) return;

  if (mapReady) {
    // Clear previous selected pin state.
    if (selectedId) {
      map.setFeatureState({ source: "routes-points", id: selectedId }, { selected: false });
    }
    map.setFeatureState({ source: "routes-points", id }, { selected: true });

    // Draw the LineString.
    map.getSource("selected-route").setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: feature.geometry, properties: {} }],
    });
    if (fly) fitToRoutes([feature], true);
  }

  selectedId = id;
  openDetail(feature);
  highlightResult(id);
}

function clearSelection() {
  if (mapReady) {
    if (selectedId) {
      map.setFeatureState({ source: "routes-points", id: selectedId }, { selected: false });
    }
    map.getSource("selected-route").setData({ type: "FeatureCollection", features: [] });
  }
  selectedId = null;
}

// ---- Bounds --------------------------------------------------------------
function fitToRoutes(features, animate) {
  const bounds = new maplibregl.LngLatBounds();
  for (const f of features) {
    for (const c of f.geometry.coordinates) bounds.extend(c);
  }
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 360, right: 380 }, animate, maxZoom: 13 });
}

// ---- Detail panel --------------------------------------------------------
function setupDetailPanel() {
  document.getElementById("detail-close").addEventListener("click", () => {
    document.getElementById("detail").classList.remove("is-open");
    document.getElementById("detail").setAttribute("aria-hidden", "true");
    clearSelection();
    highlightResult(null);
  });
}

function openDetail(feature) {
  const p = feature.properties;
  const panel = document.getElementById("detail");
  const photo = document.getElementById("detail-photo");

  // Photo degrades gracefully if the hero image isn't present yet.
  photo.hidden = true;
  if (p.photo_url) {
    photo.onload = () => (photo.hidden = false);
    photo.onerror = () => (photo.hidden = true);
    photo.src = p.photo_url;
    photo.alt = p.name;
  }

  setText("detail-name", p.name);
  setText("detail-region", p.region);
  setText("detail-distance", `${p.distance_km} km`);
  setText("detail-elevation", `${p.elevation_gain_m} m`);
  setText("detail-difficulty", cap(p.terrain_difficulty));
  setText("detail-surface", p.surface);
  setText("detail-lastridden", formatSince(p.last_ridden));
  setText("detail-vetted", p.vetted_by || "—");
  setText("detail-description", p.description);

  const dl = document.getElementById("detail-download");
  dl.onclick = () => requestDownload({ id: p.id, gpx_url: p.gpx_url });

  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
}

// ---- Results list + filter refresh --------------------------------------
function refresh() {
  const filtered = applyFilters(routeFeatures);
  if (mapReady) map.getSource("routes-points").setData(pointsFC(filtered));
  renderResults(filtered);
  // If the selected route fell out of the filter, drop the selection.
  if (selectedId && !filtered.some((f) => f.properties.id === selectedId)) {
    clearSelection();
    document.getElementById("detail").classList.remove("is-open");
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
      `${p.distance_km} km · ${cap(p.terrain_difficulty)} · ${p.region}`;
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
function setupSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  const close = document.getElementById("sidebar-close");
  // Mobile: the panel is closed by default (CSS) so the map shows first.
  const setOpen = (open) => {
    sidebar.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () =>
    setOpen(!sidebar.classList.contains("is-open"))
  );
  if (close) close.addEventListener("click", () => setOpen(false));
}

// ---- Helpers -------------------------------------------------------------
function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatSince(iso) {
  const days = Math.floor((Date.now() - new Date(iso + "T00:00:00Z")) / 86400000);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = (days / 365).toFixed(1);
  return `${years} years ago`;
}
