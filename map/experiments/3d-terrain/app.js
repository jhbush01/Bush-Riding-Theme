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
  stat.textContent = `terrain on · exaggeration ${exaggeration.toFixed(1)} · hillshade on`;
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

function updateStat() {
  stat.textContent = `terrain ${terrainOn ? "on" : "off"} · exaggeration ${exaggeration.toFixed(1)} · hillshade ${hillshadeOn ? "on" : "off"}`;
}

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
