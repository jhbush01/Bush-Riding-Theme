// Bush Riding — 3D terrain spike (EXPERIMENTAL, not production).
//
// Scope, after the first spike (map/experiments/3d-pins): globe projection and
// the Three.js pin layer were dropped by decision — only native MapLibre 3D
// terrain + hillshade was worth keeping. This file has no Three.js, no custom
// layer, no globe. Plain MapLibre, mercator projection, raster-dem terrain.

const TERRAIN_SOURCE = "terrain-dem";
const EXAG_STEP = 0.2;
const EXAG_MIN = 0.4;
const EXAG_MAX = 2.6;
let exaggeration = 1.4; // matches style.json's default so the button state starts in sync

const stat = document.getElementById("stat");
const warn = document.getElementById("warn");

// D'Aguilar Range / Mount Nebo — real Bush Riding ride country with enough
// relief to actually show what terrain exaggeration is doing.
const map = new maplibregl.Map({
  container: "map",
  style: "./style.json",
  center: [152.75, -27.35],
  zoom: 11.5,
  pitch: 65,
  bearing: 18,
  maxPitch: 85,
  // Below z7-ish, a pitched 3D view starts looking past the loaded terrain
  // into flat background colour at the horizon — reads as broken "dead
  // space" rather than a wide view. minZoom keeps you out of that zone.
  // Reasoned from how the terrain-skirt/horizon artifact typically behaves
  // at pitch 60+, not visually confirmed — tune this once you've seen it.
  minZoom: 7,
  dragRotate: true,
  pitchWithRotate: true,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

let terrainOn = true;
let hillshadeOn = true;
let topDown = false;

map.on("load", () => {
  // Terrain is declared in style.json, but assert it here too so a style edit
  // can't silently drop it.
  if (!map.getTerrain()) {
    try {
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration });
    } catch (e) {
      showWarn("Terrain source failed to attach — check the raster-dem endpoint in style.json. " + e.message);
    }
  }
  updateStat();
});

map.on("error", (e) => {
  const msg = e?.error?.message || "unknown map error";
  if (/terrain|dem|elevation|hillshade/i.test(msg)) {
    showWarn("DEM tiles are not loading. Check the Network tab for tiles.mapterhorn.com — see README.md.");
  }
});

function showWarn(text) {
  warn.hidden = false;
  warn.textContent = text;
}

// Elevation readout at map centre — an "explorer tool" touch that costs
// nothing extra, since the DEM tiles are already loaded for the terrain
// geometry. queryTerrainElevation() only answers once tiles for the current
// view have arrived, so this silently no-ops (shows "—") until then.
function updateStat() {
  const centerElev = terrainOn ? map.queryTerrainElevation(map.getCenter()) : null;
  const elevText = centerElev == null ? "—" : `${Math.round(centerElev)} m`;
  stat.textContent = `terrain ${terrainOn ? "on" : "off"} · exaggeration ${exaggeration.toFixed(1)} · hillshade ${hillshadeOn ? "on" : "off"} · centre elevation ${elevText}`;
}
map.on("move", updateStat);

document.getElementById("toggle-terrain").addEventListener("click", (e) => {
  terrainOn = !terrainOn;
  map.setTerrain(terrainOn ? { source: TERRAIN_SOURCE, exaggeration } : null);
  e.target.textContent = terrainOn ? "Flatten terrain" : "Restore terrain";
  e.target.classList.toggle("is-off", !terrainOn);
  updateStat();
});

document.getElementById("toggle-hillshade").addEventListener("click", (e) => {
  hillshadeOn = !hillshadeOn;
  map.setLayoutProperty("hillshade", "visibility", hillshadeOn ? "visible" : "none");
  e.target.textContent = hillshadeOn ? "Hide hillshade" : "Show hillshade";
  e.target.classList.toggle("is-off", !hillshadeOn);
  updateStat();
});

document.getElementById("toggle-pitch").addEventListener("click", (e) => {
  topDown = !topDown;
  map.easeTo({ pitch: topDown ? 0 : 65, duration: 900 });
  e.target.textContent = topDown ? "Tilt to 3D" : "Top-down";
});

document.getElementById("exag-down").addEventListener("click", () => setExaggeration(exaggeration - EXAG_STEP));
document.getElementById("exag-up").addEventListener("click", () => setExaggeration(exaggeration + EXAG_STEP));

function setExaggeration(next) {
  exaggeration = Math.min(EXAG_MAX, Math.max(EXAG_MIN, next));
  if (terrainOn) map.setTerrain({ source: TERRAIN_SOURCE, exaggeration });
  updateStat();
}

/* ── Compass / rotate control ─────────────────────────────────────────────
   dragRotate is already on (right-click-drag or two-finger twist), but that's
   not discoverable. This is an explicit, visible control: drag the compass
   needle to spin the map's bearing directly; a plain click/tap resets to
   north. Own pointer-event code, not relying on NavigationControl's compass
   (which only resets north on click — it does not support drag-to-rotate). */
const compass = document.getElementById("compass");
const needle = document.getElementById("compass-needle");

function syncNeedle() {
  needle.style.transform = `rotate(${-map.getBearing()}deg)`;
}
map.on("rotate", syncNeedle);
syncNeedle();

let dragging = false;
let moved = false;

compass.addEventListener("pointerdown", (e) => {
  compass.setPointerCapture(e.pointerId);
  dragging = true;
  moved = false;
});

compass.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  moved = true;
  const rect = compass.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // atan2 measures from +X (3 o'clock); bearing measures clockwise from
  // north (12 o'clock), hence the +90 offset before flipping the sign.
  const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  map.setBearing(angle + 90);
});

compass.addEventListener("pointerup", (e) => {
  compass.releasePointerCapture(e.pointerId);
  dragging = false;
  if (!moved) map.easeTo({ bearing: 0, duration: 500 }); // plain click/tap → reset north
});
