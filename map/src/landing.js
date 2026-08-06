// Bush Map — landing globe.
//
// The threshold before the map: a photoreal Earth you can spin, with every
// route pinned on it. Press a pin (or Enter the map) and the camera flies from
// orbit down to the ground.
//
// The Earth here is the MAP ITSELF in globe projection, wearing the Esri
// imagery already configured in bush.json. That matters: it means the pins are
// the real pins, the fly-in is one continuous camera move rather than a handoff
// between two renderers, and there is no Blue Marble texture to host. A
// separate Three.js sphere would have looked the same standing still and worse
// the moment anything moved.
//
// Additive by design — map.js does not import this, and nothing here reaches
// into map.js's internals beyond the documented window.brmMap hooks.

const LANDING_KEY = "brm.landed";
const HOME = { center: [134, -26], zoom: 2.15 }; // Australia, held at arm's length
const SPIN_DEG_PER_SEC = 1.6; // a slow drift; the planet should feel unhurried

let map = null;
let spinning = false;
let spinRAF = null;
let dismissed = false;

const el = (id) => document.getElementById(id);

export function initLanding(mapInstance) {
  map = mapInstance;
  const root = el("landing");
  if (!root || !map) return;

  // Returning riders go straight to the map. The landing is an arrival, and an
  // arrival you have to sit through every visit stops being one.
  if (sessionStorage.getItem(LANDING_KEY) === "1") {
    root.hidden = true;
    return;
  }

  document.body.classList.add("is-landing");
  root.hidden = false;

  map.setProjection({ type: "globe" });
  map.jumpTo({ center: HOME.center, zoom: HOME.zoom, pitch: 0, bearing: 0 });

  // Cluster count bubbles are drawn onto the canvas by MapLibre, so CSS cannot
  // reach them — they read as a glitch sitting over the cover copy. Individual
  // pins stay: pressing one is the whole point of the screen.
  setClusterBadges(false);

  startSpin();
  startClock();
  wireDismiss(root);
  countRoutes();
}

/* ── Idle spin ────────────────────────────────────────────────────────────
   Bearing-free: we move the CENTRE westward so the planet turns under a fixed
   camera, which is what reads as a rotating globe. Rotating the bearing would
   spin the frame instead, which looks like the camera rolling. */
function startSpin() {
  spinning = true;
  let last = performance.now();
  const step = (now) => {
    if (!spinning) return;
    const dt = (now - last) / 1000;
    last = now;
    const c = map.getCenter();
    map.jumpTo({ center: [c.lng + SPIN_DEG_PER_SEC * dt, c.lat] });
    updateCoords();
    spinRAF = requestAnimationFrame(step);
  };
  spinRAF = requestAnimationFrame(step);

  // Any real input hands control over — the drift is an invitation, not a ride.
  const canvas = map.getCanvas();
  for (const ev of ["mousedown", "wheel", "touchstart"]) {
    canvas.addEventListener(ev, stopSpin, { passive: true, once: true });
  }
}

function setClusterBadges(visible) {
  for (const id of ["clusters", "cluster-count"]) {
    if (map.getLayer && map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
  }
}

function stopSpin() {
  spinning = false;
  if (spinRAF !== null) cancelAnimationFrame(spinRAF);
  spinRAF = null;
}

/* ── Telemetry ─────────────────────────────────────────────────────────── */
function startClock() {
  const tick = () => {
    if (dismissed) return;
    const now = new Date();
    const t = el("ld-time");
    if (t) {
      t.textContent = now.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    }
    const z = el("ld-zone");
    if (z) {
      const off = -now.getTimezoneOffset() / 60;
      z.textContent = (Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL") +
        " (UTC" + (off >= 0 ? "+" : "") + off + ")";
    }
    setTimeout(tick, 1000);
  };
  tick();
}

// Latitude/longitude of whatever is at the centre of the globe right now.
function updateCoords() {
  const c = map.getCenter();
  const lat = el("ld-lat");
  const lon = el("ld-lon");
  const norm = ((c.lng + 180) % 360 + 360) % 360 - 180;
  if (lat) lat.textContent = Math.abs(c.lat).toFixed(4) + "° " + (c.lat >= 0 ? "N" : "S");
  if (lon) lon.textContent = Math.abs(norm).toFixed(4) + "° " + (norm >= 0 ? "E" : "W");
}

// Route count, once map.js has finished loading its data.
function countRoutes() {
  const set = (n) => {
    const node = el("ld-count");
    if (node) node.textContent = String(n).padStart(2, "0");
  };
  const read = () => {
    const n = window.brmMap && typeof window.brmMap.routeCount === "function"
      ? window.brmMap.routeCount()
      : 0;
    if (n) set(n);
    return n;
  };
  if (!read()) {
    // Data arrives asynchronously; check again on the next idle frame or two.
    let tries = 0;
    const retry = setInterval(() => {
      if (read() || ++tries > 20) clearInterval(retry);
    }, 400);
  }
}

/* ── Entering the map ─────────────────────────────────────────────────────
   MapLibre's globe resolves toward a mercator view as you zoom in, so flying
   from orbit to a route is a single continuous move — no cut, no reprojection
   flash. The projection is set to mercator only once the flight has landed. */
function wireDismiss(root) {
  const enter = el("ld-enter");
  if (enter) enter.addEventListener("click", () => dismiss(null));

  // Pressing a pin enters the map at that pin. map.js's own click handlers run
  // alongside this and do the selecting; this only clears the cover.
  const pinLayers = ["unclustered", "clusters", "famous-hit", "event-hit"].filter(
    (l) => map.getLayer && map.getLayer(l)
  );
  if (pinLayers.length) {
    map.on("click", pinLayers, () => dismiss("pin"));
  }
}

function dismiss(via) {
  if (dismissed) return;
  dismissed = true;
  stopSpin();
  try {
    sessionStorage.setItem(LANDING_KEY, "1");
  } catch (_) {
    /* private mode — the landing will simply show again next visit */
  }

  setClusterBadges(true);

  const root = el("landing");
  if (root) {
    root.classList.add("is-leaving");
    setTimeout(() => {
      root.hidden = true;
      document.body.classList.remove("is-landing");
    }, 760);
  } else {
    document.body.classList.remove("is-landing");
  }

  // A pin click hands the camera to map.js (it frames and orbits the route),
  // so only the "enter" button needs to fly the map itself.
  if (via !== "pin" && window.brmMap && typeof window.brmMap.showAllRoutes === "function") {
    window.brmMap.showAllRoutes();
  }

  // Drop back to mercator once the movement settles, so the rest of the map
  // behaves exactly as it always has.
  map.once("moveend", () => {
    try {
      map.setProjection({ type: "mercator" });
    } catch (_) {
      /* older build without projection switching — harmless */
    }
  });
}
