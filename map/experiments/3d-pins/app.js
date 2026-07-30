// Bush Riding — 3D pin spike (EXPERIMENTAL, not production).
//
// Three things stacked on one page:
//   1. MapLibre native globe projection          (style.json → projection.type)
//   2. MapLibre native 3D terrain from a raster-dem source (style.json → terrain)
//   3. Extruded 3D pins rendered by Three.js through a MapLibre custom layer
//
// Only (3) is genuinely new capability — (1) and (2) are native MapLibre v5 and
// need no third-party renderer. The custom layer is the actual learning target.
//
// Nothing here imports from, or is imported by, the production map. The pulse
// animation below is written from scratch; it deliberately does NOT touch
// startPulse() in map/src/map.js.

import * as THREE from "three";

/* ── Pin geometry constants (metres) ──────────────────────────────────────── */
const TOWER_HEIGHT = 2600; // tall enough to read at country zoom
const TOWER_RADIUS = 320;
const HEAD_RADIUS = 620;
const PULSE_PERIOD_MS = 2600;

const PIN_COLOR = 0xc1572e; // --terracotta, matching production bush-event pins
const HEAD_COLOR = 0xd7e04b; // --lemon, the "active" accent

/* ── Sample coordinates ───────────────────────────────────────────────────────
   map/data/events.geojson is a seed file that currently holds ONE feature; the
   real events live in D1 behind map-api.bushriding.cc. For a spike we want 3–5
   pins, so: read the seed file first (read-only, per brief), then top up from
   the live events API if it answers, and fall back to a few real Bush Riding
   ride locations so the page always renders offline. */
const FALLBACK_PINS = [
  { name: "Range Road Ridge Ride", lngLat: [152.8231, -27.1969] },
  { name: "Lacey's Creek Loop", lngLat: [152.8036, -27.1258] },
  { name: "Goat Track Loop", lngLat: [152.7594, -27.3312] },
  { name: "Glass House Mountains", lngLat: [152.9553, -26.8992] },
  { name: "Kilcoy to Jimna", lngLat: [152.5636, -26.9447] },
];

async function loadPins() {
  const pins = [];
  try {
    const seed = await fetch("../../data/events.geojson").then((r) => r.json());
    for (const f of seed.features || []) {
      if (f.geometry && f.geometry.type === "Point") {
        pins.push({ name: f.properties?.subtitle || f.properties?.name || "Event", lngLat: f.geometry.coordinates });
      }
    }
  } catch (_) {
    /* offline / file missing — fall through to the fallback set */
  }
  if (pins.length < 3) {
    for (const p of FALLBACK_PINS) {
      if (!pins.some((x) => Math.abs(x.lngLat[0] - p.lngLat[0]) < 0.001 && Math.abs(x.lngLat[1] - p.lngLat[1]) < 0.001)) {
        pins.push(p);
      }
      if (pins.length >= 5) break;
    }
  }
  return pins.slice(0, 5);
}

/* ── Map ──────────────────────────────────────────────────────────────────── */
const stat = document.getElementById("stat");
const warn = document.getElementById("warn");

const map = new maplibregl.Map({
  container: "map",
  style: "./style.json",
  center: [152.8, -27.1],
  zoom: 2.2,
  // The spike WANTS rotation — production disables it deliberately, but a globe
  // you can't spin isn't much of a globe.
  dragRotate: true,
  pitchWithRotate: true,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
map.addControl(new maplibregl.GlobeControl(), "bottom-right");

let spinning = true;
let pins = [];

map.on("load", async () => {
  pins = await loadPins();
  stat.textContent = `${pins.length} pins · loading terrain…`;

  // Terrain is declared in style.json, but assert it here too so a style edit
  // can't silently drop it.
  if (!map.getTerrain()) {
    try {
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.3 });
    } catch (e) {
      showWarn("Terrain source failed to attach — check the raster-dem endpoint in style.json. " + e.message);
    }
  }

  map.addLayer(makePinLayer(pins));
  spin();
  stat.textContent = `${pins.length} pins · globe + terrain + Three.js custom layer`;
});

map.on("error", (e) => {
  const msg = e?.error?.message || "unknown map error";
  if (/terrain|dem|elevation/i.test(msg)) {
    showWarn("DEM tiles are not loading. The terrain endpoint in style.json may be unreachable — see README.md for the Mapterhorn swap.");
  }
});

function showWarn(text) {
  warn.hidden = false;
  warn.textContent = text;
}

/* ── Slow auto-spin, paused on interaction ────────────────────────────────── */
function spin() {
  if (!spinning) return;
  const c = map.getCenter();
  c.lng += 0.06;
  map.easeTo({ center: c, duration: 100, easing: (t) => t });
}
map.on("moveend", () => {
  if (spinning) requestAnimationFrame(spin);
});
for (const ev of ["mousedown", "touchstart", "wheel"]) {
  map.getCanvas().addEventListener(ev, () => setSpin(false), { passive: true });
}

function setSpin(on) {
  spinning = on;
  document.getElementById("toggle-spin").textContent = on ? "Stop spin" : "Start spin";
  if (on) spin();
}
document.getElementById("toggle-spin").addEventListener("click", () => setSpin(!spinning));

document.getElementById("toggle-projection").addEventListener("click", (e) => {
  const isGlobe = (map.getProjection()?.type || "globe") === "globe";
  map.setProjection({ type: isGlobe ? "mercator" : "globe" });
  e.target.textContent = isGlobe ? "Switch to globe" : "Switch to mercator";
});

document.getElementById("fly-pins").addEventListener("click", () => {
  setSpin(false);
  const b = new maplibregl.LngLatBounds();
  for (const p of pins) b.extend(p.lngLat);
  // Deliberately simple padding — production's fitPadding() is untouched and
  // not imported here.
  map.fitBounds(b, { padding: 120, pitch: 62, duration: 2200, maxZoom: 11 });
});

/* ── The custom layer: a Three.js scene sharing MapLibre's WebGL context ──────
   Each pin is a Group placed at its ABSOLUTE mercator coordinate and scaled by
   that latitude's metres-per-mercator-unit, so the geometry can be authored in
   real metres. The camera matrix comes straight from MapLibre each frame via
   args.defaultProjectionData.mainMatrix, which is what makes the meshes track
   the map under both projections and under terrain. */
function makePinLayer(pinList) {
  let scene, camera, renderer, heads;
  const groups = [];

  return {
    id: "brm-3d-pins",
    type: "custom",
    renderingMode: "3d",

    onAdd(mapInstance, gl) {
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      heads = [];

      scene.add(new THREE.AmbientLight(0xffffff, 1.5));
      const key = new THREE.DirectionalLight(0xfff4e2, 2.2);
      key.position.set(0.6, -1, 1).normalize();
      scene.add(key);

      const towerGeo = new THREE.CylinderGeometry(TOWER_RADIUS * 0.55, TOWER_RADIUS, TOWER_HEIGHT, 20);
      const towerMat = new THREE.MeshStandardMaterial({ color: PIN_COLOR, roughness: 0.55, metalness: 0.05 });
      const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 24, 18);

      for (const pin of pinList) {
        const group = new THREE.Group();

        // Mercator placement. z carries the terrain elevation once known.
        const mc = maplibregl.MercatorCoordinate.fromLngLat(pin.lngLat, 0);
        const scale = mc.meterInMercatorCoordinateUnits();
        group.position.set(mc.x, mc.y, mc.z);
        // Mercator Y runs the opposite way to Three's, hence the negative Y scale.
        group.scale.set(scale, -scale, scale);
        group.userData = { lngLat: pin.lngLat, name: pin.name };

        // Geometry authored in metres, standing on the ground plane.
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.rotation.x = Math.PI / 2; // cylinder's +Y → map's +Z (up)
        tower.position.z = TOWER_HEIGHT / 2;
        group.add(tower);

        const head = new THREE.Mesh(
          headGeo,
          new THREE.MeshStandardMaterial({
            color: HEAD_COLOR,
            emissive: HEAD_COLOR,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.9,
            roughness: 0.3,
          })
        );
        head.position.z = TOWER_HEIGHT + HEAD_RADIUS * 0.6;
        group.add(head);
        heads.push(head);

        scene.add(group);
        groups.push(group);
      }

      renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      // Once terrain tiles are in, lift each pin onto the actual ground.
      mapInstance.once("idle", () => settleOnTerrain(mapInstance));
      mapInstance.on("sourcedata", (e) => {
        if (e.sourceId === "terrain-dem" && e.isSourceLoaded) settleOnTerrain(mapInstance);
      });
    },

    render(gl, args) {
      // Pulse: the head breathes on a sine, zero-crossing at both ends of the
      // cycle so there is no visible pop when it resets. (Independent of the
      // production ring pulse — same idea, separate code.)
      const phase = (performance.now() % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
      const wave = Math.sin(Math.PI * phase);
      for (const head of heads) {
        const s = 1 + wave * 0.55;
        head.scale.set(s, s, s);
        head.material.opacity = 0.35 + wave * 0.55;
      }

      // MapLibre v5 hands the current projection's matrix here; using it keeps
      // the meshes correct in mercator AND globe without any manual math.
      const matrix = args?.defaultProjectionData?.mainMatrix || args?.modelViewProjectionMatrix;
      if (!matrix) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);

      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint(); // keep the pulse running
    },
  };

  function settleOnTerrain(mapInstance) {
    for (const group of groups) {
      const { lngLat } = group.userData;
      let elev = 0;
      try {
        elev = mapInstance.queryTerrainElevation(lngLat) || 0;
      } catch (_) {
        /* terrain not ready — leave at sea level */
      }
      const mc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, elev);
      group.position.set(mc.x, mc.y, mc.z);
    }
  }
}
