// Bush Riding Map — personal ride diary (additive). Does not modify map.js or
// filters.js; it attaches via the window.brmMap / "brm:mapready" hook.

const API = (window.BRM_CONFIG?.diaryApi || "").replace(/\/$/, "");
const OCHRE = "#C4956A";
const COMMUNITY_LAYER = "selected-route-line"; // diary lines go below this

let map = null;
let currentEmail = null;
let currentUsername = null;
let currentIsAdmin = false;
let authMode = "login";
let cardRideId = null;
// Callbacks fired whenever sign-in state changes (used by reviews.js).
const authListeners = [];
function notifyAuth() {
  for (const cb of authListeners) {
    try {
      cb();
    } catch (_) {
      /* ignore listener errors */
    }
  }
}

// Shared auth surface for other modules (reviews.js) — one sign-in UI for the
// whole app. Function declarations below are hoisted, so this is safe here.
window.brmAuth = {
  isSignedIn: () => !!currentEmail,
  needsUsername: () => !!currentEmail && !currentUsername,
  user: () => (currentEmail ? { email: currentEmail, username: currentUsername, isAdmin: currentIsAdmin } : null),
  token: () => token,
  openAuth: () => openAuth(),
  ensureUsername: (cb) => openUsername(cb),
  onChange: (cb) => {
    if (typeof cb === "function") authListeners.push(cb);
  },
};
// Bearer token (header auth). Stored in localStorage so the session survives
// refreshes; sent as Authorization. Avoids the cross-subdomain cookie that
// iOS Safari blocks.
let token = null;
try {
  token = localStorage.getItem("brd_token") || null;
} catch {
  /* private mode */
}
function setToken(t) {
  token = t || null;
  try {
    if (t) localStorage.setItem("brd_token", t);
    else localStorage.removeItem("brd_token");
  } catch {
    /* ignore */
  }
}
function withToken(url) {
  if (!token) return url;
  return url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
}
const chips = { weather: null, surface: null, vibe: null };
const EMPTY_FC = { type: "FeatureCollection", features: [] };

/* ---------------- boot ---------------- */
if (window.brmMapReady) init();
else window.addEventListener("brm:mapready", init, { once: true });

async function init() {
  map = window.brmMap;
  wireUI();
  if (!API) return; // diary not configured — "My Rides" will just say so
  if (await checkSession()) await loadDiaryLayer();
}

/* ---------------- fetch helper ---------------- */
async function api(path, opts = {}) {
  // Keep every request "simple" (no CORS preflight): token in the query, and
  // string bodies sent as text/plain. Preflight to the diary domain was failing
  // in all browsers; the community worker works precisely because it never
  // preflights.
  const headers = { ...(opts.headers || {}) };
  if (typeof opts.body === "string" && !headers["Content-Type"]) headers["Content-Type"] = "text/plain";
  let res;
  try {
    res = await fetch(withToken(API + path), { ...opts, headers });
  } catch (e) {
    throw new Error("Network error: " + (e && e.message ? e.message : e));
  }
  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    // Surface the real reason instead of a generic code, so failures are
    // diagnosable (worker error message, or the raw body if it isn't JSON).
    const detail = (data && data.error) || text.slice(0, 180) || "(empty body)";
    throw new Error(`${res.status}: ${detail}`);
  }
  return data || {};
}

async function checkSession() {
  if (!token) return false;
  try {
    const s = await api("/auth/session");
    if (s && s.loggedIn) {
      currentEmail = s.email;
      currentUsername = s.username || null;
      currentIsAdmin = !!s.isAdmin;
      notifyAuth();
      return true;
    }
  } catch {
    /* worker unreachable — treat as logged out */
  }
  setToken(null); // stale/invalid token
  return false;
}

/* ---------------- element refs ---------------- */
const $ = (id) => document.getElementById(id);

function wireUI() {
  // My Rides nav button
  $("my-rides-btn").addEventListener("click", () => {
    if (!API) return toast("Diary isn't available right now.");
    if (currentEmail) openDiary();
    else openAuth();
  });

  // Auth modal
  document.querySelectorAll("[data-auth-close]").forEach((el) => el.addEventListener("click", closeAuth));
  document.querySelectorAll("[data-auth-tab]").forEach((el) =>
    el.addEventListener("click", () => setAuthMode(el.dataset.authTab))
  );
  $("auth-form").addEventListener("submit", submitAuth);

  // Username prompt
  $("username-form").addEventListener("submit", submitUsername);

  // Diary panel
  $("diary-close").addEventListener("click", () => hide("diary-panel"));
  $("diary-add").addEventListener("click", openUpload);
  $("diary-signout").addEventListener("click", signOut);

  // Upload modal
  document.querySelectorAll("[data-upload-close]").forEach((el) => el.addEventListener("click", closeUpload));
  $("upload-gpx").addEventListener("change", autoTitle);
  $("upload-form").addEventListener("submit", submitUpload);
  document.querySelectorAll(".chips").forEach((group) =>
    group.querySelectorAll(".chip").forEach((btn) =>
      btn.addEventListener("click", () => toggleChip(group.dataset.chipGroup, btn))
    )
  );

  // Memory card
  $("card-close").addEventListener("click", () => hide("memory-card"));
  $("card-delete").addEventListener("click", deleteCurrent);
  $("card-edit").addEventListener("click", toggleEdit);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["auth-modal", "upload-modal"].forEach((id) => $(id).classList.remove("is-open"));
  });
}

/* ---------------- auth modal ---------------- */
function openAuth() {
  setAuthMode("login");
  $("auth-error").hidden = true;
  $("auth-form").reset();
  $("auth-modal").classList.add("is-open");
  $("auth-modal").setAttribute("aria-hidden", "false");
}
function closeAuth() {
  $("auth-modal").classList.remove("is-open");
  $("auth-modal").setAttribute("aria-hidden", "true");
}
function setAuthMode(mode) {
  authMode = mode;
  $("tab-login").classList.toggle("is-active", mode === "login");
  $("tab-register").classList.toggle("is-active", mode === "register");
  $("auth-submit").textContent = mode === "register" ? "Create account" : "Sign in";
  $("auth-password").setAttribute("autocomplete", mode === "register" ? "new-password" : "current-password");
  // Username is required only when creating an account.
  const uField = $("auth-username");
  uField.hidden = mode !== "register";
  uField.required = mode === "register";
  $("auth-error").hidden = true;
}
async function submitAuth(e) {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const username = $("auth-username").value.trim();
  const btn = $("auth-submit");
  btn.disabled = true;
  $("auth-error").hidden = true;
  try {
    const body = authMode === "register" ? { email, password, username } : { email, password };
    const r = await api(authMode === "register" ? "/auth/register" : "/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setToken(r.token);
    currentEmail = r.email;
    currentUsername = r.username || null;
    currentIsAdmin = !!r.isAdmin;
    closeAuth();
    notifyAuth();
    // "Prompt on next sign-in": older accounts have no username yet.
    if (r.needsUsername) openUsername();
    else openDiary();
    await loadDiaryLayer();
  } catch (err) {
    $("auth-error").textContent = err.message || "Something went wrong.";
    $("auth-error").hidden = false;
  } finally {
    btn.disabled = false;
  }
}
function signOut() {
  setToken(null);
  currentEmail = null;
  currentUsername = null;
  currentIsAdmin = false;
  if (map && map.getSource("diary-rides")) map.getSource("diary-rides").setData(EMPTY_FC);
  const stats = $("diary-stats");
  if (stats) stats.hidden = true;
  hide("diary-panel");
  hide("memory-card");
  notifyAuth();
}

/* ---------------- username prompt (backfill / set) ---------------- */
let afterUsername = null; // optional callback once a username is saved
function openUsername(onDone) {
  afterUsername = onDone || null;
  $("username-error").hidden = true;
  $("username-form").reset();
  $("username-input").value = currentUsername || "";
  $("username-modal").classList.add("is-open");
  $("username-modal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("username-input").focus(), 50);
}
function closeUsername() {
  $("username-modal").classList.remove("is-open");
  $("username-modal").setAttribute("aria-hidden", "true");
}
async function submitUsername(e) {
  e.preventDefault();
  const username = $("username-input").value.trim();
  const btn = $("username-submit");
  btn.disabled = true;
  $("username-error").hidden = true;
  try {
    const r = await api("/auth/username", { method: "POST", body: JSON.stringify({ username }) });
    currentUsername = r.username;
    closeUsername();
    notifyAuth();
    const cb = afterUsername;
    afterUsername = null;
    if (cb) cb();
  } catch (err) {
    $("username-error").textContent = err.message || "Couldn't save that username.";
    $("username-error").hidden = false;
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- diary panel + layer ---------------- */
function openDiary() {
  show("diary-panel");
}

async function loadDiaryLayer() {
  if (!map) return;
  let fc;
  try {
    fc = await api("/rides");
  } catch (err) {
    toast("Couldn't load your rides.");
    return;
  }
  if (map.getSource("diary-rides")) {
    map.getSource("diary-rides").setData(fc);
  } else {
    map.addSource("diary-rides", { type: "geojson", data: fc });
    const before = map.getLayer(COMMUNITY_LAYER) ? COMMUNITY_LAYER : undefined;
    map.addLayer(
      {
        id: "diary-lines",
        type: "line",
        source: "diary-rides",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": OCHRE, "line-width": 2.5 },
      },
      before
    );
    map.on("click", "diary-lines", (e) => openCard(e.features[0].properties.id));
    map.on("mouseenter", "diary-lines", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "diary-lines", () => (map.getCanvas().style.cursor = ""));
  }
  renderList(fc.features || []);
  loadStats();
}

async function loadStats() {
  const el = $("diary-stats");
  if (!el) return;
  try {
    const s = await api("/rides/stats");
    if (!s || !s.total_rides) {
      el.hidden = true;
      return;
    }
    $("stat-rides").textContent = s.total_rides;
    $("stat-distance").textContent = `${s.total_distance_km} km`;
    $("stat-elevation").textContent = `${s.total_elevation_m} m`;
    el.hidden = false;
  } catch {
    el.hidden = true; // non-fatal — the list still shows
  }
}

function renderList(features) {
  const list = $("diary-list");
  list.innerHTML = "";
  $("diary-empty").hidden = features.length > 0;
  features.forEach((f) => {
    const p = f.properties;
    const li = document.createElement("li");
    li.className = "ritem";
    li.innerHTML = `<p class="ritem__date"></p><p class="ritem__title"></p><p class="ritem__meta"></p>`;
    li.querySelector(".ritem__date").textContent = fmtDate(p.recorded_at);
    li.querySelector(".ritem__title").textContent = p.title || "Untitled ride";
    li.querySelector(".ritem__meta").textContent = `${p.distance_km} km`;
    li.addEventListener("click", () => openCard(p.id));
    list.appendChild(li);
  });
}

/* ---------------- upload ---------------- */
function openUpload() {
  $("upload-form").reset();
  chips.weather = chips.surface = chips.vibe = null;
  document.querySelectorAll(".chip.is-active").forEach((c) => c.classList.remove("is-active"));
  $("upload-error").hidden = true;
  $("upload-modal").classList.add("is-open");
  $("upload-modal").setAttribute("aria-hidden", "false");
}
function closeUpload() {
  $("upload-modal").classList.remove("is-open");
  $("upload-modal").setAttribute("aria-hidden", "true");
}
function toggleChip(group, btn) {
  const val = btn.dataset.chip;
  const groupEl = btn.closest(".chips");
  const active = btn.classList.contains("is-active");
  groupEl.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
  if (active) {
    chips[group] = null;
  } else {
    btn.classList.add("is-active");
    chips[group] = val;
  }
}
async function autoTitle() {
  const file = $("upload-gpx").files[0];
  if (!file) return;
  let name = "";
  try {
    const text = await file.text();
    const m = text.match(/<name>([^<]+)<\/name>/);
    if (m) name = m[1].trim();
  } catch {
    /* ignore */
  }
  if (!name) name = file.name.replace(/\.gpx$/i, "").replace(/[-_]+/g, " ").trim();
  if (name && !$("upload-title-input").value) $("upload-title-input").value = name;
}
async function submitUpload(e) {
  e.preventDefault();
  const btn = $("upload-submit");
  btn.disabled = true;
  btn.textContent = "Inking…";
  $("upload-error").hidden = true;
  try {
    const fd = new FormData();
    fd.append("gpx", $("upload-gpx").files[0]);
    fd.append("title", $("upload-title-input").value.trim());
    fd.append("note", $("upload-note").value.trim());
    fd.append("companions", $("upload-companions").value.trim());
    if (chips.weather) fd.append("weather", chips.weather);
    if (chips.surface) fd.append("surface", chips.surface);
    if (chips.vibe) fd.append("vibe", chips.vibe);
    if ($("upload-photo").files[0]) fd.append("photo", $("upload-photo").files[0]);

    const ride = await api("/rides", { method: "POST", body: fd });
    closeUpload();
    // Ink on a clear map so the draw-on is actually visible, THEN open the
    // rides drawer (which on a phone covers most of the screen). If there's no
    // geometry the animation no-ops and we fall straight through to the panel.
    inkAnimation(ride.geometry, async () => {
      await loadDiaryLayer();
      show("diary-panel");
    });
  } catch (err) {
    $("upload-error").textContent = err.message || "Upload failed.";
    $("upload-error").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Ink the Map";
  }
}

/* ---------------- ink animation (cinematic draw-on) ----------------
   Reveal the ride by *growing* the line one frame at a time: each frame we
   re-set the source to the coordinates from the start up to the current head.
   This animates on every MapLibre version (line-trim-offset wasn't reliably
   animatable here, so the line just appeared all at once). The camera rides
   along with the head so you relive the ride: zoom to the start → follow the
   inking head → pull back to the whole route. */
function inkAnimation(geometry, done) {
  const finish = () => done && done();
  if (!map || !geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
    return finish();
  }
  const coords = geometry.coordinates;

  // Cumulative along-route distance, used to walk the head at a steady pace.
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + segKm(coords[i - 1], coords[i]));
  const totalKm = cum[cum.length - 1] || 0;

  const lineFeature = (cs) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: cs },
    properties: {},
  });
  const seed = lineFeature([coords[0], coords[0]]); // valid 2-point start
  if (map.getSource("diary-ink")) map.getSource("diary-ink").setData(seed);
  else map.addSource("diary-ink", { type: "geojson", data: seed });

  const before = map.getLayer(COMMUNITY_LAYER) ? COMMUNITY_LAYER : undefined;
  if (!map.getLayer("diary-ink")) {
    map.addLayer(
      {
        id: "diary-ink",
        type: "line",
        source: "diary-ink",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": OCHRE, "line-width": 3.5 },
      },
      before
    );
  }

  const bounds = boundsOf(coords);
  // Pace the reveal to the ride: longer rides take longer to ink. ~2.75s/km,
  // clamped so a short loop still feels deliberate and an epic doesn't drag.
  // Deliberately slow (~5× a brisk draw-on) so you can actually watch the ride
  // retrace itself and the basemap keeps up under the moving camera.
  const DUR = Math.max(22500, Math.min(55000, 17500 + totalKm * 2750));
  // Follow a little closer than the whole-route framing so there's a sense of
  // travel, but never so close we lose the thread on a big ride.
  const fitZoom = (() => {
    try {
      return map.cameraForBounds(bounds, { padding: 60 }).zoom;
    } catch {
      return map.getZoom();
    }
  })();
  const followZoom = Math.max(9, Math.min(14, fitZoom + 1.2));

  // Phase 1: glide to the start. Then phase 2 inks while the camera follows.
  map.once("moveend", runInk);
  map.easeTo({ center: coords[0], zoom: followZoom, duration: 900 });
  // Safety net: if moveend never fires (interrupted move), start anyway.
  const kick = setTimeout(runInk, 1100);

  let started = false;
  function runInk() {
    if (started) return;
    started = true;
    clearTimeout(kick);
    const src = map.getSource("diary-ink");
    const start = performance.now();
    (function frame(now) {
      const lin = Math.min(1, (now - start) / DUR);
      const t = easeInOut(lin);
      const drawn = sliceAt(coords, cum, totalKm, t);
      if (src) src.setData(lineFeature(drawn));
      map.setCenter(drawn[drawn.length - 1]); // camera rides the inking head
      if (lin < 1) return requestAnimationFrame(frame);
      // Phase 3: pull back to reveal the whole inked route, then hand off.
      let ended = false;
      const cleanup = () => {
        if (ended) return;
        ended = true;
        if (map.getLayer("diary-ink")) map.removeLayer("diary-ink");
        if (map.getSource("diary-ink")) map.removeSource("diary-ink");
        finish();
      };
      // Whichever comes first — moveend, or a timeout in case fitBounds is a
      // no-op and never fires moveend (otherwise the ride list wouldn't refresh).
      map.once("moveend", cleanup);
      setTimeout(cleanup, 1600);
      map.fitBounds(bounds, { padding: 70, duration: 1300, maxZoom: 13 });
    })(start);
  }
}

// Equirectangular segment length in km — plenty accurate for local pacing.
function segKm(a, b) {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = (((b[0] - a[0]) * Math.PI) / 180) * Math.cos(((a[1] + b[1]) / 2 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng) * R;
}
// Coordinates from the start up to along-route fraction `frac` (0..1), with the
// final vertex interpolated so the head advances smoothly between GPX points.
// Always returns at least two points so it's a valid LineString.
function sliceAt(coords, cum, total, frac) {
  if (frac <= 0 || !total) return [coords[0], coords[0]];
  if (frac >= 1) return coords.slice();
  const target = frac * total;
  const out = [coords[0]];
  let i = 1;
  while (i < cum.length && cum[i] < target) {
    out.push(coords[i]);
    i++;
  }
  if (i < coords.length) {
    const span = cum[i] - cum[i - 1] || 1e-9;
    const r = (target - cum[i - 1]) / span;
    const a = coords[i - 1], b = coords[i];
    out.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]);
  }
  if (out.length < 2) out.push(out[out.length - 1]);
  return out;
}
function boundsOf(coords) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const c of coords) {
    minX = Math.min(minX, c[0]);
    minY = Math.min(minY, c[1]);
    maxX = Math.max(maxX, c[0]);
    maxY = Math.max(maxY, c[1]);
  }
  return [[minX, minY], [maxX, maxY]];
}
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/* ---------------- memory card ---------------- */
async function openCard(id) {
  let ride;
  try {
    ride = await api("/rides/" + id);
  } catch (err) {
    return toast("Couldn't open that ride.");
  }
  cardRideId = id;
  exitEdit();
  const photo = $("card-photo");
  photo.alt = ride.title || "";
  setProtectedImage(photo, ride.photo_url);
  $("card-title").textContent = ride.title || "Untitled ride";
  $("card-date").textContent = fmtDate(ride.recorded_at);
  $("card-distance").textContent = `${ride.distance_km} km`;
  $("card-elevation").textContent = `${ride.elevation_m} m`;
  $("card-note").textContent = ride.note || "";
  $("card-companions").textContent = ride.companions ? "Rode with " + ride.companions : "";
  const chipWrap = $("card-chips");
  chipWrap.innerHTML = "";
  [ride.weather, ride.surface, ride.vibe].filter(Boolean).forEach((v) => {
    const span = document.createElement("span");
    span.className = "card-chip";
    span.textContent = cap(v);
    chipWrap.appendChild(span);
  });
  $("card-title").dataset.raw = ride.title || "";
  $("card-note").dataset.raw = ride.note || "";
  show("memory-card");
}

function toggleEdit() {
  if (editing()) saveEdit();
  else enterEdit();
}
function editing() {
  return $("memory-card").classList.contains("is-editing");
}
function enterEdit() {
  const card = $("memory-card");
  card.classList.add("is-editing");
  $("card-edit").textContent = "Save";
  $("card-title").innerHTML = `<input id="edit-title" class="field-input" type="text" maxlength="120" />`;
  $("edit-title").value = $("card-title").dataset.raw;
  $("card-note").innerHTML = `<textarea id="edit-note" class="field-input" rows="3" maxlength="2000"></textarea>`;
  $("edit-note").value = $("card-note").dataset.raw;
}
function exitEdit() {
  $("memory-card").classList.remove("is-editing");
  $("card-edit").textContent = "Edit";
}
async function saveEdit() {
  const title = $("edit-title") ? $("edit-title").value.trim() : undefined;
  const note = $("edit-note") ? $("edit-note").value.trim() : undefined;
  try {
    await api("/rides/" + cardRideId + "/update", {
      method: "POST",
      body: JSON.stringify({ title, note }),
    });
    await openCard(cardRideId); // re-render read-only
    await loadDiaryLayer();
  } catch (err) {
    toast(err.message || "Couldn't save.");
  }
}
async function deleteCurrent() {
  if (!cardRideId || !confirm("Delete this ride? This can't be undone.")) return;
  try {
    await api("/rides/" + cardRideId + "/delete", { method: "POST" });
    hide("memory-card");
    await loadDiaryLayer();
  } catch (err) {
    toast(err.message || "Couldn't delete.");
  }
}

/* ---------------- small helpers ---------------- */
function show(id) {
  $(id).classList.add("is-open");
  $(id).setAttribute("aria-hidden", "false");
}
function hide(id) {
  $(id).classList.remove("is-open");
  $(id).setAttribute("aria-hidden", "true");
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
// Photos are auth-protected, and <img src> can't send the Bearer header — so
// fetch the image with the header and show it via an object URL.
async function setProtectedImage(imgEl, url) {
  imgEl.hidden = true;
  if (imgEl._url) {
    URL.revokeObjectURL(imgEl._url);
    imgEl._url = null;
  }
  if (!url) return;
  try {
    const res = await fetch(withToken(url)); // token in query (no preflight)
    if (!res.ok) return;
    const blob = await res.blob();
    imgEl._url = URL.createObjectURL(blob);
    imgEl.src = imgEl._url;
    imgEl.hidden = false;
  } catch {
    /* leave hidden */
  }
}
function toast(msg) {
  let t = $("brm-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "brm-toast";
    t.className = "brm-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("is-show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("is-show"), 3000);
}
