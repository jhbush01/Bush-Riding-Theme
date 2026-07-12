// Bush Riding Map — accounts + reviews + "my submissions" Worker (authenticated).
// Bindings: DB (D1), BUCKET (R2), COMMUNITY_DB (D1, read-only). Secret: JWT_SECRET.
import { hashPassword, verifyPassword, signJWT, verifyJWT, JWT_TTL_SEC } from "./auth.js";

const MAX_PHOTO = 6 * 1024 * 1024; // review photos
const COOKIE = "brd_session";

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
      // A signed-in contributor's own submitted routes + moderation status.
      if (p === "/my-submissions" && M === "GET") return mySubmissions(request, env, cors);
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

/* ---------------- My submissions ---------------- */
// A signed-in contributor's own submitted community routes, with each one's
// moderation status and any note from the reviewer. Read from the community
// routes DB (bound read-only as COMMUNITY_DB); matched to the account by email.
async function mySubmissions(request, env, cors) {
  const u = await authed(request, env);
  if (!u) return json({ error: "Not authenticated" }, 401, cors);
  if (!env.COMMUNITY_DB) return json({ items: [] }, 200, cors);
  let rows = [];
  try {
    const res = await env.COMMUNITY_DB.prepare(
      `SELECT id, name, region, state, distance_km, elevation_gain_m, status,
              review_note, series, created_at, reviewed_at
         FROM submissions WHERE lower(email) = lower(?) ORDER BY created_at DESC`
    ).bind(u.email).all();
    rows = res.results || [];
  } catch (e) {
    // review_note may not exist yet on an un-migrated community DB — retry without it.
    try {
      const res = await env.COMMUNITY_DB.prepare(
        `SELECT id, name, region, state, distance_km, elevation_gain_m, status,
                series, created_at, reviewed_at
           FROM submissions WHERE lower(email) = lower(?) ORDER BY created_at DESC`
      ).bind(u.email).all();
      rows = (res.results || []).map((r) => ({ ...r, review_note: null }));
    } catch (_) {
      return json({ items: [] }, 200, cors);
    }
  }
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    region: r.region || "",
    state: r.state || "",
    distance_km: r.distance_km,
    elevation_gain_m: r.elevation_gain_m,
    // Normalise to the three contributor-facing stages.
    status: r.status === "published" ? "approved" : r.status === "rejected" ? "rejected" : "pending",
    note: r.review_note || "",
    series: r.series || "",
    created_at: r.created_at || "",
    reviewed_at: r.reviewed_at || "",
  }));
  return json({ items }, 200, cors);
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
