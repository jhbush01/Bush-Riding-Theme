// Bush Riding Map — personal ride diary Worker (authenticated).
// Bindings: DB (D1), BUCKET (R2). Secret: JWT_SECRET. Vars: ALLOWED_ORIGINS, PUBLIC_URL.
import { hashPassword, verifyPassword, signJWT, verifyJWT, JWT_TTL_SEC } from "./auth.js";
import { parseGpx } from "./gpx.js";

const MAX_GPX = 5 * 1024 * 1024;
const MAX_PHOTO = 6 * 1024 * 1024;
const COOKIE = "brd_session";
const WEATHER = ["sunny", "overcast", "wet"];
const SURFACE = ["smooth", "rough", "muddy"];
const VIBE = ["suffered", "cruised", "flew"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      // Works whether reached directly (diary.bushridingmap.com/...) or via a
      // /diary-api/* proxy or Worker Route on the Pages domain.
      let p = url.pathname;
      if (p.startsWith("/diary-api")) p = p.slice("/diary-api".length) || "/";
      const M = request.method;
      if (p === "/auth/register" && M === "POST") return register(request, env, cors);
      if (p === "/auth/login" && M === "POST") return login(request, env, cors);
      if (p === "/auth/logout" && M === "POST") return logout(cors);
      if (p === "/auth/session" && M === "GET") return session(request, env, cors);
      if (p === "/auth/username" && M === "POST") return setUsername(request, env, cors);
      // Community route reviews. GET is public; POST/delete need a session.
      if (p === "/reviews" && M === "GET") return listReviews(request, env, cors);
      if (p === "/reviews" && M === "POST") return createReview(request, env, cors);
      const rev = p.match(/^\/reviews\/([A-Za-z0-9_-]+)\/delete$/);
      if (rev && M === "POST") return deleteReview(request, env, cors, rev[1]);
      // Public (unauthenticated) read of review photos only.
      if (p.startsWith("/public/") && M === "GET")
        return servePublicFile(request, env, cors, decodeURIComponent(p.slice(8)));
      if (p === "/rides" && M === "GET") return listRides(request, env, cors);
      if (p === "/rides" && M === "POST") return createRide(request, env, cors);
      if (p === "/rides/stats" && M === "GET") return stats(request, env, cors);
      // No-preflight POST aliases for edit/delete (PUT/DELETE force a preflight).
      const act = p.match(/^\/rides\/([A-Za-z0-9_-]+)\/(update|delete)$/);
      if (act && M === "POST")
        return act[2] === "update" ? updateRide(request, env, cors, act[1]) : deleteRide(request, env, cors, act[1]);
      const ride = p.match(/^\/rides\/([A-Za-z0-9_-]+)$/);
      if (ride) {
        if (M === "GET") return getRide(request, env, cors, ride[1]);
        if (M === "PUT") return updateRide(request, env, cors, ride[1]);
        if (M === "DELETE") return deleteRide(request, env, cors, ride[1]);
      }
      if (p.startsWith("/file/") && M === "GET") return serveFile(request, env, cors, decodeURIComponent(p.slice(6)));
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ error: err.message || "Server error" }, 500, cors);
    }
  },
};

/* ---------------- Auth ---------------- */
// Adds the username column + reviews table to an existing DB. ALTER fails once
// the column exists (best-effort); the CREATE IF NOT EXISTS calls are idempotent.
async function ensureAuthSchema(env) {
  try {
    await env.DB.prepare("ALTER TABLE users ADD COLUMN username TEXT").run();
  } catch (_) {
    /* column already present */
  }
  await env.DB.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username COLLATE NOCASE)"
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS reviews (
       id TEXT PRIMARY KEY, route_id TEXT NOT NULL, user_id TEXT NOT NULL,
       rating INTEGER NOT NULL, comment TEXT, photo_key TEXT,
       created_at TEXT, updated_at TEXT
     )`
  ).run();
  await env.DB.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_route_user ON reviews (route_id, user_id)"
  ).run();
  await env.DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_reviews_route ON reviews (route_id, created_at DESC)"
  ).run();
}

const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
function usernameError(u) {
  if (!u) return "Pick a username.";
  if (!USERNAME_RE.test(u)) return "Username must be 3–20 letters, numbers, _ or -.";
  return null;
}

// Admin accounts (comma-separated emails in ADMIN_EMAILS) can delete any review.
function isAdmin(email, env) {
  const list = (env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes((email || "").toLowerCase());
}

async function register(request, env, cors) {
  await ensureAuthSchema(env);
  const { email, password, username } = await request.json().catch(() => ({}));
  const e = (email || "").trim().toLowerCase();
  const u = (username || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ error: "Enter a valid email." }, 400, cors);
  const uErr = usernameError(u);
  if (uErr) return json({ error: uErr }, 400, cors);
  if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400, cors);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(e).first();
  if (existing) return json({ error: "That email is already registered." }, 409, cors);
  const taken = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(u).first();
  if (taken) return json({ error: "That username is taken." }, 409, cors);

  const id = "u_" + rand(12);
  await env.DB.prepare("INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, e, u, await hashPassword(password), new Date().toISOString())
    .run();
  return authResponse(env, cors, id, e, u);
}

async function login(request, env, cors) {
  await ensureAuthSchema(env);
  const { email, password } = await request.json().catch(() => ({}));
  const e = (email || "").trim().toLowerCase();
  const user = await env.DB.prepare("SELECT id, email, username, password_hash FROM users WHERE email = ?").bind(e).first();
  if (!user || !(await verifyPassword(password || "", user.password_hash)))
    return json({ error: "Wrong email or password." }, 401, cors);
  return authResponse(env, cors, user.id, user.email, user.username);
}

function logout(cors) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors, "Set-Cookie": cookie("", 0) },
  });
}

async function session(request, env, cors) {
  await ensureAuthSchema(env);
  const auth = await authed(request, env);
  if (!auth) return json({ loggedIn: false }, 200, cors);
  const row = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(auth.userId).first();
  const username = row ? row.username : null;
  return json(
    { loggedIn: true, email: auth.email, username: username || null, needsUsername: !username, isAdmin: isAdmin(auth.email, env) },
    200,
    cors
  );
}

// Set or change the signed-in user's username (also the backfill flow for
// accounts created before usernames existed).
async function setUsername(request, env, cors) {
  await ensureAuthSchema(env);
  const auth = await authed(request, env);
  if (!auth) return json({ error: "Not authenticated" }, 401, cors);
  const { username } = await request.json().catch(() => ({}));
  const u = (username || "").trim();
  const uErr = usernameError(u);
  if (uErr) return json({ error: uErr }, 400, cors);
  const taken = await env.DB
    .prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?")
    .bind(u, auth.userId)
    .first();
  if (taken) return json({ error: "That username is taken." }, 409, cors);
  await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(u, auth.userId).run();
  return json({ ok: true, username: u }, 200, cors);
}

async function authResponse(env, cors, id, email, username) {
  if (!env.JWT_SECRET) {
    return json(
      { error: "JWT_SECRET is not set on this worker. Add it in Settings → Variables and secrets." },
      500,
      cors
    );
  }
  const token = await signJWT({ sub: id, email }, env.JWT_SECRET);
  return new Response(
    JSON.stringify({
      ok: true,
      email,
      username: username || null,
      needsUsername: !username,
      isAdmin: isAdmin(email, env),
      token,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors, "Set-Cookie": cookie(token, JWT_TTL_SEC) },
    }
  );
}

// Reads the session from the cookie, or a Bearer header (for non-browser clients).
async function authed(request, env) {
  // Token may arrive as a query param (keeps requests "simple" / preflight-free),
  // a Bearer header, or the legacy cookie.
  let token = new URL(request.url).searchParams.get("token");
  if (!token) token = getCookie(request, COOKIE);
  if (!token) {
    const h = request.headers.get("Authorization") || "";
    if (h.startsWith("Bearer ")) token = h.slice(7);
  }
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  return payload ? { userId: payload.sub, email: payload.email } : null;
}

/* ---------------- Rides ---------------- */
async function listRides(request, env, cors) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  const { results } = await env.DB.prepare(
    "SELECT id, title, recorded_at, distance_km, elevation_m, vibe, geojson FROM rides WHERE user_id = ? ORDER BY recorded_at DESC"
  )
    .bind(u.userId)
    .all();
  const features = (results || []).map((r) => ({
    type: "Feature",
    geometry: safeGeo(r.geojson),
    properties: {
      id: r.id,
      title: r.title,
      recorded_at: r.recorded_at,
      distance_km: r.distance_km,
      elevation_m: r.elevation_m,
      vibe: r.vibe,
    },
  }));
  return json({ type: "FeatureCollection", features }, 200, cors);
}

async function createRide(request, env, cors) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);

  const form = await request.formData();
  const gpxFile = form.get("gpx");
  let title = (form.get("title") || "").toString().trim().slice(0, 120);
  const note = (form.get("note") || "").toString().trim().slice(0, 2000) || null;
  const companions = (form.get("companions") || "").toString().trim().slice(0, 200) || null;
  const weather = chip(form.get("weather"), WEATHER);
  const surface = chip(form.get("surface"), SURFACE);
  const vibe = chip(form.get("vibe"), VIBE);
  const photoFile = form.get("photo");

  if (!gpxFile || typeof gpxFile.text !== "function") return json({ error: "A GPX file is required." }, 400, cors);
  if (gpxFile.size > MAX_GPX) return json({ error: "GPX too large (max 5 MB)." }, 400, cors);
  if (!title) return json({ error: "A ride title is required." }, 400, cors);

  let parsed;
  try {
    parsed = parseGpx(await gpxFile.text());
  } catch (e) {
    return json({ error: "Could not read that GPX: " + e.message }, 400, cors);
  }

  const id = "r_" + rand(12);
  const gpxKey = `${u.userId}/${id}.gpx`;
  await env.BUCKET.put(gpxKey, await gpxFile.text(), { httpMetadata: { contentType: "application/gpx+xml" } });

  let photoKey = null;
  if (photoFile && typeof photoFile.arrayBuffer === "function" && photoFile.size > 0) {
    if (photoFile.size > MAX_PHOTO) return json({ error: "Photo too large (max 6 MB)." }, 400, cors);
    const type = photoFile.type || "image/jpeg";
    if (!/^image\//.test(type)) return json({ error: "Photo must be an image." }, 400, cors);
    photoKey = `${u.userId}/${id}_photo.${type.includes("png") ? "png" : "jpg"}`;
    await env.BUCKET.put(photoKey, await photoFile.arrayBuffer(), { httpMetadata: { contentType: type } });
  }

  const now = new Date().toISOString();
  const recorded = parsed.recorded_at || now;
  await env.DB.prepare(
    `INSERT INTO rides (id, user_id, title, recorded_at, distance_km, elevation_m, geojson,
        photo_key, note, weather, surface, vibe, companions, is_manual, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  )
    .bind(id, u.userId, title, recorded, parsed.distance_km, parsed.elevation_m, JSON.stringify(parsed.geometry),
      photoKey, note, weather, surface, vibe, companions, now)
    .run();

  return json(rideObject({ id, user_id: u.userId, title, recorded_at: recorded, distance_km: parsed.distance_km,
    elevation_m: parsed.elevation_m, geojson: JSON.stringify(parsed.geometry), photo_key: photoKey, note,
    weather, surface, vibe, companions, created_at: now }, env), 200, cors);
}

async function getRide(request, env, cors, id) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  const r = await env.DB.prepare("SELECT * FROM rides WHERE id = ? AND user_id = ?").bind(id, u.userId).first();
  if (!r) return json({ error: "Not found" }, 404, cors);
  return json(rideObject(r, env), 200, cors);
}

async function updateRide(request, env, cors, id) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  const r = await env.DB.prepare("SELECT id FROM rides WHERE id = ? AND user_id = ?").bind(id, u.userId).first();
  if (!r) return json({ error: "Not found" }, 404, cors);

  const body = await request.json().catch(() => ({}));
  const title = body.title !== undefined ? String(body.title).trim().slice(0, 120) : undefined;
  const note = body.note !== undefined ? String(body.note).trim().slice(0, 2000) : undefined;
  const companions = body.companions !== undefined ? String(body.companions).trim().slice(0, 200) : undefined;
  const weather = body.weather !== undefined ? chip(body.weather, WEATHER) : undefined;
  const surface = body.surface !== undefined ? chip(body.surface, SURFACE) : undefined;
  const vibe = body.vibe !== undefined ? chip(body.vibe, VIBE) : undefined;

  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries({ title, note, companions, weather, surface, vibe })) {
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      vals.push(v === "" ? null : v);
    }
  }
  if (sets.length) {
    vals.push(id, u.userId);
    await env.DB.prepare(`UPDATE rides SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).bind(...vals).run();
  }
  const fresh = await env.DB.prepare("SELECT * FROM rides WHERE id = ? AND user_id = ?").bind(id, u.userId).first();
  return json(rideObject(fresh, env), 200, cors);
}

async function deleteRide(request, env, cors, id) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  const row = await env.DB.prepare("SELECT photo_key FROM rides WHERE id = ? AND user_id = ?").bind(id, u.userId).first();
  if (!row) return json({ error: "Not found" }, 404, cors);
  await env.BUCKET.delete(`${u.userId}/${id}.gpx`);
  if (row.photo_key) await env.BUCKET.delete(row.photo_key);
  await env.DB.prepare("DELETE FROM rides WHERE id = ? AND user_id = ?").bind(id, u.userId).run();
  return json({ ok: true }, 200, cors);
}

async function stats(request, env, cors) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  const agg = await env.DB.prepare(
    `SELECT COUNT(*) AS total_rides, COALESCE(SUM(distance_km),0) AS total_distance_km,
            COALESCE(SUM(elevation_m),0) AS total_elevation_m,
            MIN(recorded_at) AS first_ride_at, MAX(recorded_at) AS most_recent_at
       FROM rides WHERE user_id = ?`
  ).bind(u.userId).first();
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT country FROM rides WHERE user_id = ? AND country IS NOT NULL"
  ).bind(u.userId).all();
  return json({
    total_rides: agg.total_rides,
    total_distance_km: Math.round(agg.total_distance_km),
    total_elevation_m: Math.round(agg.total_elevation_m),
    countries: (results || []).map((r) => r.country),
    first_ride_at: agg.first_ride_at,
    most_recent_at: agg.most_recent_at,
  }, 200, cors);
}

async function serveFile(request, env, cors, key) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  if (!key.startsWith(u.userId + "/")) return json({ error: "Forbidden" }, 403, cors); // ownership
  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ error: "Not found" }, 404, cors);
  const headers = new Headers(cors);
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=3600");
  return new Response(obj.body, { headers });
}

/* ---------------- Reviews ---------------- */
// Public: list a route's reviews + aggregate rating. Optionally reads the
// caller's session (if present) to flag which review is theirs / deletable.
async function listReviews(request, env, cors) {
  await ensureAuthSchema(env);
  const routeId = new URL(request.url).searchParams.get("route_id");
  if (!routeId) return json({ error: "route_id required" }, 400, cors);
  const base = (env.PUBLIC_URL || "").replace(/\/$/, "");
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.user_id, r.rating, r.comment, r.photo_key, r.created_at, r.updated_at, u.username
       FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.route_id = ? ORDER BY r.created_at DESC`
  )
    .bind(routeId)
    .all();
  const rows = results || [];
  const count = rows.length;
  const average = count ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;

  const viewer = await authed(request, env);
  const admin = viewer ? isAdmin(viewer.email, env) : false;

  const reviews = rows.map((r) => ({
    id: r.id,
    username: r.username,
    rating: r.rating,
    comment: r.comment || "",
    photo_url: r.photo_key ? `${base}/public/${r.photo_key}` : "",
    created_at: r.created_at,
    edited: !!(r.updated_at && r.updated_at !== r.created_at),
    mine: viewer ? r.user_id === viewer.userId : false,
    can_delete: admin || (viewer ? r.user_id === viewer.userId : false),
  }));
  const mine = reviews.find((r) => r.mine) || null;
  return json({ route_id: routeId, count, average, is_admin: admin, mine, reviews }, 200, cors);
}

// Signed-in only. Upsert this user's single review for the route (one editable
// review per rider). Multipart form: route_id, rating (1–5), comment, photo.
async function createReview(request, env, cors) {
  await ensureAuthSchema(env);
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  const urow = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(u.userId).first();
  if (!urow || !urow.username)
    return json({ error: "Choose a username before reviewing.", needsUsername: true }, 409, cors);

  const form = await request.formData();
  const routeId = (form.get("route_id") || "").toString().trim().slice(0, 100);
  const rating = parseInt(form.get("rating"), 10);
  const comment = (form.get("comment") || "").toString().trim().slice(0, 1000) || null;
  const photoFile = form.get("photo");
  if (!routeId) return json({ error: "Missing route." }, 400, cors);
  if (!(rating >= 1 && rating <= 5)) return json({ error: "Pick a rating from 1 to 5 stars." }, 400, cors);

  const existing = await env.DB
    .prepare("SELECT id, photo_key FROM reviews WHERE route_id = ? AND user_id = ?")
    .bind(routeId, u.userId)
    .first();
  const id = existing ? existing.id : "rv_" + rand(12);

  let photoKey = existing ? existing.photo_key : null;
  if ((form.get("remove_photo") || "").toString() === "1" && photoKey) {
    await env.BUCKET.delete(photoKey);
    photoKey = null;
  }
  if (photoFile && typeof photoFile.arrayBuffer === "function" && photoFile.size > 0) {
    if (photoFile.size > MAX_PHOTO) return json({ error: "Photo too large (max 6 MB)." }, 400, cors);
    const type = photoFile.type || "image/jpeg";
    if (!/^image\//.test(type)) return json({ error: "Photo must be an image." }, 400, cors);
    if (photoKey) await env.BUCKET.delete(photoKey);
    photoKey = `reviews/${u.userId}/${id}.${type.includes("png") ? "png" : "jpg"}`;
    await env.BUCKET.put(photoKey, await photoFile.arrayBuffer(), { httpMetadata: { contentType: type } });
  }

  const now = new Date().toISOString();
  if (existing) {
    await env.DB.prepare("UPDATE reviews SET rating=?, comment=?, photo_key=?, updated_at=? WHERE id=?")
      .bind(rating, comment, photoKey, now, id)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO reviews (id, route_id, user_id, rating, comment, photo_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)"
    )
      .bind(id, routeId, u.userId, rating, comment, photoKey, now, now)
      .run();
  }
  return json({ ok: true, id }, 200, cors);
}

// Delete a review: the author, or an admin (ADMIN_EMAILS), may remove it.
async function deleteReview(request, env, cors, id) {
  await ensureAuthSchema(env);
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  const row = await env.DB.prepare("SELECT user_id, photo_key FROM reviews WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "Not found" }, 404, cors);
  if (row.user_id !== u.userId && !isAdmin(u.email, env)) return json({ error: "Forbidden" }, 403, cors);
  if (row.photo_key) await env.BUCKET.delete(row.photo_key);
  await env.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
  return json({ ok: true }, 200, cors);
}

// Public read of review photos only (everything else stays owner-private).
async function servePublicFile(request, env, cors, key) {
  if (!key.startsWith("reviews/")) return json({ error: "Forbidden" }, 403, cors);
  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ error: "Not found" }, 404, cors);
  const headers = new Headers(cors);
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=86400");
  return new Response(obj.body, { headers });
}

/* ---------------- Helpers ---------------- */
function rideObject(r, env) {
  const base = (env.PUBLIC_URL || "").replace(/\/$/, "");
  return {
    id: r.id,
    title: r.title,
    recorded_at: r.recorded_at,
    distance_km: r.distance_km,
    elevation_m: r.elevation_m,
    geometry: safeGeo(r.geojson),
    note: r.note || "",
    weather: r.weather || null,
    surface: r.surface || null,
    vibe: r.vibe || null,
    companions: r.companions || "",
    photo_url: r.photo_key ? `${base}/file/${r.photo_key}` : "",
    created_at: r.created_at,
  };
}
function safeGeo(s) {
  try {
    return JSON.parse(s);
  } catch {
    return { type: "LineString", coordinates: [] };
  }
}
function chip(v, allowed) {
  const s = (v || "").toString().trim().toLowerCase();
  return allowed.includes(s) ? s : null;
}
function cookie(token, maxAge) {
  // SameSite=None; Secure so the cross-subdomain credentialed fetch from the
  // Pages site to this worker sends it. HttpOnly keeps it out of JS (XSS-safe).
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function corsHeaders(request) {
  // Auth is via a Bearer token (Authorization header), not cookies, so no
  // credentialed CORS — which iOS Safari blocks across subdomains. Reflect the
  // origin and allow the Authorization header.
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", ...cors } });
}
function rand(n) {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(n));
  for (let i = 0; i < n; i++) s += a[r[i] % a.length];
  return s;
}
