// Bush Riding Map — contributor account surface (additive).
// Sign in / create an account, and see the routes you've submitted with their
// moderation status (Pending approval / Rejected — see comments / Approved).
// Personal ride logging, the "ink the map" animation and the ochre ride lines
// were removed — Strava / RideWithGPS cover a personal activity diary far
// better. This is the first step toward contributor / ambassador tooling.
//
// Reuses the same auth as reviews.js via the shared window.brmAuth surface.

const API = (window.BRM_CONFIG?.diaryApi || "").replace(/\/$/, "");

let currentEmail = null;
let currentUsername = null;
let currentIsAdmin = false;
let authMode = "login";

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

// Bearer token (header auth), stored in localStorage so the session survives
// refreshes. Sent as ?token= to keep requests preflight-free.
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

async function init() {
  wireUI();
  if (!API) return; // account API not configured
  await checkSession();
}

/* ---------------- fetch helper ---------------- */
async function api(path, opts = {}) {
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
    /* non-JSON */
  }
  if (!res.ok) {
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

let subsTab = "pending";

function wireUI() {
  // Account nav button
  $("my-rides-btn").addEventListener("click", () => {
    if (!API) return toast("Accounts aren't available right now.");
    if (currentEmail) openSubmissions();
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

  // Submissions panel
  $("subs-close").addEventListener("click", () => hide("submissions-panel"));
  $("subs-signout").addEventListener("click", signOut);
  document.querySelectorAll("[data-subs-tab]").forEach((el) =>
    el.addEventListener("click", () => setSubsTab(el.dataset.subsTab))
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["auth-modal"].forEach((id) => $(id) && $(id).classList.remove("is-open"));
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
    if (r.needsUsername) openUsername(() => openSubmissions());
    else openSubmissions();
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
  hide("submissions-panel");
  notifyAuth();
}

/* ---------------- username prompt (backfill / set) ---------------- */
let afterUsername = null;
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

/* ---------------- My submissions ---------------- */
const STAGE = {
  pending: { label: "Pending approval", tabEmpty: "Nothing waiting on review right now." },
  rejected: { label: "Rejected — see comments", tabEmpty: "No rejected submissions." },
  approved: { label: "Approved", tabEmpty: "No approved routes yet." },
};

let submissions = [];

async function openSubmissions() {
  show("submissions-panel");
  setSubsTab(subsTab);
  await loadSubmissions();
}

async function loadSubmissions() {
  const list = $("subs-list");
  const empty = $("subs-empty");
  empty.hidden = false;
  empty.textContent = "Loading…";
  list.innerHTML = "";
  try {
    const r = await api("/my-submissions");
    submissions = Array.isArray(r.items) ? r.items : [];
  } catch (err) {
    submissions = [];
    empty.textContent = "Couldn't load your submissions.";
    return;
  }
  updateCounts();
  renderSubs();
}

function updateCounts() {
  for (const stage of Object.keys(STAGE)) {
    const n = submissions.filter((s) => s.status === stage).length;
    const el = document.querySelector(`.subs-tab__n[data-count="${stage}"]`);
    if (el) el.textContent = String(n);
  }
}

function setSubsTab(stage) {
  subsTab = STAGE[stage] ? stage : "pending";
  document.querySelectorAll("[data-subs-tab]").forEach((el) =>
    el.classList.toggle("is-active", el.dataset.subsTab === subsTab)
  );
  renderSubs();
}

function renderSubs() {
  const list = $("subs-list");
  const empty = $("subs-empty");
  if (!list) return;
  list.innerHTML = "";
  const items = submissions.filter((s) => s.status === subsTab);
  if (!items.length) {
    empty.hidden = false;
    empty.textContent = STAGE[subsTab].tabEmpty;
    return;
  }
  empty.hidden = true;
  for (const s of items) {
    list.appendChild(subItem(s));
  }
}

function subItem(s) {
  const li = document.createElement("li");
  li.className = "subs-item subs-item--" + s.status;

  const name = document.createElement("p");
  name.className = "subs-item__name";
  name.textContent = s.name || "Untitled route";
  li.appendChild(name);

  const meta = document.createElement("p");
  meta.className = "subs-item__meta";
  const bits = [
    [s.region, s.state].filter(Boolean).join(", "),
    s.distance_km != null ? `${Math.round(s.distance_km)} km` : "",
    s.created_at ? "submitted " + fmtDate(s.created_at) : "",
  ].filter(Boolean);
  meta.textContent = bits.join(" · ");
  li.appendChild(meta);

  const badge = document.createElement("span");
  badge.className = "subs-item__badge subs-item__badge--" + s.status;
  badge.textContent = STAGE[s.status] ? STAGE[s.status].label : s.status;
  li.appendChild(badge);

  if (s.status === "rejected" && s.note) {
    const note = document.createElement("p");
    note.className = "subs-item__note";
    note.textContent = s.note;
    li.appendChild(note);
  }

  if (s.status === "approved") {
    const link = document.createElement("a");
    link.className = "subs-item__link";
    link.href = routePageUrl(s);
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "View route page ↗";
    li.appendChild(link);
  }
  return li;
}

// Mirror of the route-page slug rules (see map.js / the generator).
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function routePageUrl(s) {
  const st = slugify(s.state) || "au";
  const rg = slugify(s.region) || "other";
  return `/routes/${st}/${rg}/${s.id}`;
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

/* ---------------- boot (last, so all consts above are initialised) ---------- */
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
