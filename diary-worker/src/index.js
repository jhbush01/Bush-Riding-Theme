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
      const p = url.pathname;
      const M = request.method;
      if (p === "/auth/register" && M === "POST") return register(request, env, cors);
      if (p === "/auth/login" && M === "POST") return login(request, env, cors);
      if (p === "/auth/logout" && M === "POST") return logout(cors);
      if (p === "/auth/session" && M === "GET") return session(request, env, cors);
      if (p === "/rides" && M === "GET") return listRides(request, env, cors);
      if (p === "/rides" && M === "POST") return createRide(request, env, cors);
      if (p === "/rides/stats" && M === "GET") return stats(request, env, cors);
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
async function register(request, env, cors) {
  const { email, password } = await request.json().catch(() => ({}));
  const e = (email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return json({ error: "Enter a valid email." }, 400, cors);
  if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400, cors);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(e).first();
  if (existing) return json({ error: "That email is already registered." }, 409, cors);

  const id = "u_" + rand(12);
  await env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, e, await hashPassword(password), new Date().toISOString())
    .run();
  return authResponse(env, cors, id, e);
}

async function login(request, env, cors) {
  const { email, password } = await request.json().catch(() => ({}));
  const e = (email || "").trim().toLowerCase();
  const user = await env.DB.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").bind(e).first();
  if (!user || !(await verifyPassword(password || "", user.password_hash)))
    return json({ error: "Wrong email or password." }, 401, cors);
  return authResponse(env, cors, user.id, user.email);
}

function logout(cors) {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors, "Set-Cookie": cookie("", 0) },
  });
}

async function session(request, env, cors) {
  const auth = await authed(request, env);
  return json({ loggedIn: !!auth, email: auth ? auth.email : null }, 200, cors);
}

async function authResponse(env, cors, id, email) {
  const token = await signJWT({ sub: id, email }, env.JWT_SECRET);
  return new Response(JSON.stringify({ ok: true, email, token }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...cors, "Set-Cookie": cookie(token, JWT_TTL_SEC) },
  });
}

// Reads the session from the cookie, or a Bearer header (for non-browser clients).
async function authed(request, env) {
  let token = getCookie(request, COOKIE);
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

// build: 2026-06-30T06:11:03Z
