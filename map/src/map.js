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
  // The camera is already framed on the routes via the constructor's bounds;
  // no need to re-fit here (which caused a visible jump on load).
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
      map.setFeatureState({ source: "routes-points", id: selectedId }, { selected: false });
    }
    map.getSource("selected-route").setData({ type: "FeatureCollection", features: [] });
  }
  selectedId = null;
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
  // The panel sits in the right band, so reserving the right edge keeps the
  // route clear of it.
  return {
    top: 60,
    bottom: 60,
    left: 380,
    right: detailOpen ? 420 : 80,
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
  fillDetail(feature);
  const first = !detailOpen;
  detailOpen = true;
  els.detail.classList.add("is-open");
  els.detail.setAttribute("aria-hidden", "false");

  if (isSheetMode()) {
    if (first) {
      // Rise from off-screen to the peek state.
      applySheetState("closed", false);
      requestAnimationFrame(() => setSheetState("peek"));
    } else {
      // Re-selecting another route: return to peek per the interaction spec.
      setSheetState("peek");
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

// Populate the detail fields. Photo degrades gracefully if absent.
function fillDetail(feature) {
  const p = feature.properties;
  const photo = els.detail.querySelector("#detail-photo");
  photo.hidden = true;
  if (p.photo_url) {
    photo.onload = () => (photo.hidden = false);
    photo.onerror = () => (photo.hidden = true);
    photo.src = p.photo_url;
    photo.alt = p.name;
  } else {
    photo.removeAttribute("src");
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

  els.detail.querySelector("#detail-download").onclick = () =>
    requestDownload({ id: p.id, gpx_url: p.gpx_url });
}

// ---- Drag gesture (sheet mode) -------------------------------------------
function onDragStart(e) {
  if (!isSheetMode() || !detailOpen) return;
  if (e.target.closest("button")) return; // let close / download taps through
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
  // the detail surface.
  if (selectedId && !filtered.some((f) => f.properties.id === selectedId)) {
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
let setSidebarOpen = () => {}; // assigned in setupSidebarToggle

function setupSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  const close = document.getElementById("sidebar-close");
  // Mobile: the panel is closed by default (CSS) so the map shows first.
  setSidebarOpen = (open) => {
    sidebar.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  };
  toggle.addEventListener("click", () =>
    setSidebarOpen(!sidebar.classList.contains("is-open"))
  );
  if (close) close.addEventListener("click", () => setSidebarOpen(false));
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

function formatSince(iso) {
  const days = Math.floor((Date.now() - new Date(iso + "T00:00:00Z")) / 86400000);
  if (days < 31) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = (days / 365).toFixed(1);
  return `${years} years ago`;
}
