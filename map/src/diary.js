// Bush Riding Map — personal ride diary (additive). Does not modify map.js or
// filters.js; it attaches via the window.brmMap / "brm:mapready" hook.

const API = (window.BRM_CONFIG?.diaryApi || "").replace(/\/$/, "");
const OCHRE = "#C4956A";
const COMMUNITY_LAYER = "selected-route-line"; // diary lines go below this

let map = null;
let currentEmail = null;
let authMode = "login";
let cardRideId = null;
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
  const res = await fetch(API + path, { credentials: "include", ...opts });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON (e.g. file) */
  }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

async function checkSession() {
  try {
    const s = await api("/auth/session");
    if (s && s.loggedIn) {
      currentEmail = s.email;
      return true;
    }
  } catch {
    /* worker unreachable — treat as logged out */
  }
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
  $("auth-error").hidden = true;
}
async function submitAuth(e) {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const btn = $("auth-submit");
  btn.disabled = true;
  $("auth-error").hidden = true;
  try {
    const r = await api(authMode === "register" ? "/auth/register" : "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    currentEmail = r.email;
    closeAuth();
    openDiary();
    await loadDiaryLayer();
  } catch (err) {
    $("auth-error").textContent = err.message || "Something went wrong.";
    $("auth-error").hidden = false;
  } finally {
    btn.disabled = false;
  }
}
async function signOut() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  currentEmail = null;
  if (map && map.getSource("diary-rides")) map.getSource("diary-rides").setData(EMPTY_FC);
  hide("diary-panel");
  hide("memory-card");
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
    show("diary-panel");
    inkAnimation(ride.geometry, async () => {
      await loadDiaryLayer();
    });
  } catch (err) {
    $("upload-error").textContent = err.message || "Upload failed.";
    $("upload-error").hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Ink the Map";
  }
}

/* ---------------- ink animation (progressive draw-on) ---------------- */
function inkAnimation(geometry, done) {
  if (!map || !geometry || !geometry.coordinates || geometry.coordinates.length < 2) {
    return done && done();
  }
  const data = { type: "Feature", geometry, properties: {} };
  if (map.getSource("diary-ink")) map.getSource("diary-ink").setData(data);
  else map.addSource("diary-ink", { type: "geojson", data, lineMetrics: true });

  const before = map.getLayer(COMMUNITY_LAYER) ? COMMUNITY_LAYER : undefined;
  if (!map.getLayer("diary-ink")) {
    map.addLayer(
      {
        id: "diary-ink",
        type: "line",
        source: "diary-ink",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 3.5,
          "line-gradient": ["step", ["line-progress"], OCHRE, 0, "rgba(0,0,0,0)"],
        },
      },
      before
    );
  }
  // Pan to the ride.
  try {
    const b = geometry.coordinates.reduce(
      (acc, c) => [Math.min(acc[0], c[0]), Math.min(acc[1], c[1]), Math.max(acc[2], c[0]), Math.max(acc[3], c[1])],
      [180, 90, -180, -90]
    );
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 80, duration: 600, maxZoom: 13 });
  } catch {
    /* ignore */
  }

  const start = performance.now();
  const DUR = 2000;
  function frame(now) {
    const t = Math.min(1, (now - start) / DUR);
    map.setPaintProperty("diary-ink", "line-gradient", [
      "step",
      ["line-progress"],
      OCHRE,
      Math.max(0.0001, t),
      "rgba(0,0,0,0)",
    ]);
    if (t < 1) requestAnimationFrame(frame);
    else {
      if (map.getLayer("diary-ink")) map.removeLayer("diary-ink");
      if (map.getSource("diary-ink")) map.removeSource("diary-ink");
      done && done();
    }
  }
  requestAnimationFrame(frame);
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
  photo.hidden = true;
  if (ride.photo_url) {
    photo.onload = () => (photo.hidden = false);
    photo.onerror = () => (photo.hidden = true);
    photo.src = ride.photo_url;
    photo.alt = ride.title || "";
  }
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
    await api("/rides/" + cardRideId, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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
    await api("/rides/" + cardRideId, { method: "DELETE" });
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
