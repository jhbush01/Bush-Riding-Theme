// Bush Riding Map — community routes Worker.
// Endpoints:
//   POST /submit        public: accept a GPX submission (status=pending)
//   GET  /routes        public: approved community routes as GeoJSON (for the map)
//   GET  /file/<key>    public: serve a stored GPX/photo from R2
//   GET  /admin         private: Basic-auth moderation page
//   POST /admin/action  private: approve / reject / remove a submission
//
// Bindings (wrangler.jsonc): DB (D1), BUCKET (R2).
// Secret: ADMIN_TOKEN (the admin password). Var: ALLOWED_ORIGINS, PUBLIC_URL.

import { parseGpx } from "./gpx.js";

const MAX_GPX = 5 * 1024 * 1024; // 5 MB
const MAX_PHOTO = 6 * 1024 * 1024; // 6 MB
const DIFFICULTIES = ["easy", "moderate", "hard"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders();
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      if (url.pathname === "/submit" && request.method === "POST") return submit(request, env, cors);
      if (url.pathname === "/routes" && request.method === "GET") return routes(env, cors);
      if (url.pathname.startsWith("/file/") && request.method === "GET") return serveFile(url, env, cors);
      if (url.pathname === "/admin" && request.method === "GET") return adminPage(request, env);
      if (url.pathname === "/admin/action" && request.method === "POST") return adminAction(request, env);
      if (url.pathname === "/admin/edit" && request.method === "POST") return adminEdit(request, env);
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ error: err.message || "Server error" }, 500, cors);
    }
  },
};

/* ---------------- Public: submit ---------------- */
async function submit(request, env, cors) {
  const form = await request.formData();
  const name = (form.get("name") || "").toString().trim();
  const region = (form.get("region") || "").toString().trim();
  const email = (form.get("email") || "").toString().trim();
  const contributor = (form.get("contributor") || "").toString().trim();
  const difficulty = (form.get("difficulty") || "").toString().trim().toLowerCase();
  const surface = (form.get("surface") || "").toString().trim().slice(0, 120);
  const description = (form.get("description") || "").toString().trim().slice(0, 400);
  const gpxFile = form.get("gpx");
  const photoFile = form.get("photo");

  if (!name) return json({ error: "Route name is required." }, 400, cors);
  if (!region) return json({ error: "Region is required." }, 400, cors);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ error: "A valid email is required." }, 400, cors);
  if (!DIFFICULTIES.includes(difficulty))
    return json({ error: "Difficulty must be easy, moderate or hard." }, 400, cors);
  if (!gpxFile || typeof gpxFile.text !== "function")
    return json({ error: "A GPX file is required." }, 400, cors);
  if (gpxFile.size > MAX_GPX) return json({ error: "GPX file too large (max 5 MB)." }, 400, cors);

  const xml = await gpxFile.text();
  let stats;
  try {
    stats = parseGpx(xml);
  } catch (e) {
    return json({ error: "Could not read that GPX: " + e.message }, 400, cors);
  }

  const id = slug(name) + "-" + rand(5);
  const gpxKey = `gpx/${id}.gpx`;
  await env.BUCKET.put(gpxKey, xml, { httpMetadata: { contentType: "application/gpx+xml" } });

  let photoKey = null;
  if (photoFile && typeof photoFile.arrayBuffer === "function" && photoFile.size > 0) {
    if (photoFile.size > MAX_PHOTO) return json({ error: "Photo too large (max 6 MB)." }, 400, cors);
    const type = photoFile.type || "image/jpeg";
    if (!/^image\//.test(type)) return json({ error: "Photo must be an image." }, 400, cors);
    photoKey = `photos/${id}.${type.includes("png") ? "png" : "jpg"}`;
    await env.BUCKET.put(photoKey, await photoFile.arrayBuffer(), { httpMetadata: { contentType: type } });
  }

  await env.DB.prepare(
    `INSERT INTO submissions
      (id, status, name, region, country, difficulty, surface, description,
       distance_km, elevation_gain_m, marker_lng, marker_lat, coords,
       gpx_key, photo_key, contributor, email, created_at)
     VALUES (?, 'pending', ?, ?, 'Australia', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id, name, region, difficulty, surface, description,
      stats.distance_km, stats.elevation_gain_m, stats.marker[0], stats.marker[1],
      JSON.stringify(stats.coords), gpxKey, photoKey, contributor, email,
      new Date().toISOString()
    )
    .run();

  return json({ ok: true, id, distance_km: stats.distance_km, elevation_gain_m: stats.elevation_gain_m }, 200, cors);
}

/* ---------------- Public: approved routes ---------------- */
async function routes(env, cors) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, region, country, difficulty, surface, description,
            distance_km, elevation_gain_m, marker_lng, marker_lat, coords,
            photo_key, contributor, created_at
       FROM submissions WHERE status = 'published' ORDER BY created_at DESC`
  ).all();

  const base = (env.PUBLIC_URL || "").replace(/\/$/, "");
  const features = (results || []).map((r) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: JSON.parse(r.coords) },
    properties: {
      id: r.id,
      name: r.name,
      marker: [r.marker_lng, r.marker_lat],
      region: r.region,
      country: r.country,
      distance_km: r.distance_km,
      elevation_gain_m: r.elevation_gain_m,
      terrain_difficulty: r.difficulty,
      surface: r.surface || "",
      last_ridden: (r.created_at || "").slice(0, 10),
      gpx_url: `${base}/file/${r.gpx_key || "gpx/" + r.id + ".gpx"}`,
      photo_url: r.photo_key ? `${base}/file/${r.photo_key}` : "",
      description: r.description || "",
      vetted_by: r.contributor ? firstName(r.contributor) : "Community",
      source: "community",
      status: "published",
    },
  }));

  return json({ type: "FeatureCollection", features }, 200, {
    ...cors,
    // No caching: approvals must appear on the map immediately.
    "Cache-Control": "no-store",
  });
}

/* ---------------- Public: serve a stored file ---------------- */
async function serveFile(url, env, cors) {
  const key = decodeURIComponent(url.pathname.replace(/^\/file\//, ""));
  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ error: "Not found" }, 404, cors);
  const headers = new Headers(cors);
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(obj.body, { headers });
}

/* ---------------- Admin: moderation ---------------- */
function requireAuth(request, env) {
  const h = request.headers.get("Authorization") || "";
  const expected = "Basic " + btoa("admin:" + (env.ADMIN_TOKEN || ""));
  return env.ADMIN_TOKEN && h === expected;
}
function authChallenge() {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Bush Riding Admin"' },
  });
}

async function adminPage(request, env) {
  if (!requireAuth(request, env)) return authChallenge();
  const { results } = await env.DB.prepare(
    `SELECT id, status, name, region, country, difficulty, surface, distance_km,
            elevation_gain_m, description, contributor, email, coords, created_at
       FROM submissions ORDER BY (status='pending') DESC, created_at DESC`
  ).all();
  return new Response(adminHtml(results || []), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function adminAction(request, env) {
  if (!requireAuth(request, env)) return authChallenge();
  const form = await request.formData();
  const id = (form.get("id") || "").toString();
  const action = (form.get("action") || "").toString();
  const map = { approve: "published", reject: "rejected", pending: "pending" };
  if (action === "remove") {
    const row = await env.DB.prepare("SELECT gpx_key, photo_key FROM submissions WHERE id=?").bind(id).first();
    if (row) {
      if (row.gpx_key) await env.BUCKET.delete(row.gpx_key);
      if (row.photo_key) await env.BUCKET.delete(row.photo_key);
    }
    await env.DB.prepare("DELETE FROM submissions WHERE id=?").bind(id).run();
  } else if (map[action]) {
    await env.DB.prepare("UPDATE submissions SET status=?, reviewed_at=? WHERE id=?")
      .bind(map[action], new Date().toISOString(), id)
      .run();
  }
  return new Response(null, { status: 303, headers: { Location: "/admin" } });
}

// Edit a route's metadata in place. Track geometry (coords/gpx) isn't touched
// here — re-submit for a new track. /routes is no-store so edits show on the
// map immediately.
async function adminEdit(request, env) {
  if (!requireAuth(request, env)) return authChallenge();
  const form = await request.formData();
  const id = (form.get("id") || "").toString();
  if (!id) return json({ error: "Missing id" }, 400, corsHeaders());

  const name = (form.get("name") || "").toString().trim();
  const region = (form.get("region") || "").toString().trim();
  const country = (form.get("country") || "").toString().trim() || "Australia";
  let difficulty = (form.get("difficulty") || "").toString().trim().toLowerCase();
  if (!DIFFICULTIES.includes(difficulty)) difficulty = "moderate";
  const surface = (form.get("surface") || "").toString().trim().slice(0, 120);
  const description = (form.get("description") || "").toString().trim().slice(0, 2000);
  const contributor = (form.get("contributor") || "").toString().trim().slice(0, 120);
  const distance = parseFloat(form.get("distance_km"));
  const elevation = parseInt(form.get("elevation_gain_m"), 10);

  if (!name || !region) return json({ error: "Name and region are required" }, 400, corsHeaders());

  await env.DB.prepare(
    `UPDATE submissions
        SET name=?, region=?, country=?, difficulty=?, surface=?, description=?,
            contributor=?, distance_km=?, elevation_gain_m=?
      WHERE id=?`
  )
    .bind(
      name,
      region,
      country,
      difficulty,
      surface,
      description,
      contributor,
      Number.isFinite(distance) ? distance : null,
      Number.isFinite(elevation) ? elevation : null,
      id
    )
    .run();

  return new Response(null, { status: 303, headers: { Location: "/admin" } });
}

/* ---------------- Helpers ---------------- */
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...(cors || {}) },
  });
}

function corsHeaders() {
  // Public, credential-free API (read routes + open submissions). Allow any
  // origin so the map works regardless of which domain serves it.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "route";
}
function rand(n) {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
function firstName(s) {
  return s.split(/\s+/)[0];
}
function esc(s) {
  return (s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

// Tiny SVG sparkline of the route shape — gives a glance during moderation.
function coordsSvg(coordsJson) {
  let coords;
  try {
    coords = JSON.parse(coordsJson);
  } catch {
    return "";
  }
  if (!coords || coords.length < 2) return "";
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = 160, h = 110, pad = 8;
  const sx = (maxX - minX) || 1e-6;
  const sy = (maxY - minY) || 1e-6;
  const pts = coords
    .map((c) => {
      const x = pad + ((c[0] - minX) / sx) * (w - 2 * pad);
      const y = h - pad - ((c[1] - minY) / sy) * (h - 2 * pad); // invert lat
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="#234a25" stroke-width="2"/></svg>`;
}

function adminHtml(rows) {
  const pending = rows.filter((r) => r.status === "pending").length;
  const card = (r) => `
    <article class="card ${esc(r.status)}">
      <div class="shape">${coordsSvg(r.coords)}</div>
      <div class="meta">
        <h3>${esc(r.name)} <span class="badge">${esc(r.status)}</span></h3>
        <p class="sub">${esc(r.region)} · ${esc(r.difficulty)} · ${r.distance_km} km · ${r.elevation_gain_m} m</p>
        <p class="desc">${esc(r.description) || "<em>no description</em>"}</p>
        <p class="by">by ${esc(r.contributor) || "—"} · ${esc(r.email)} · ${esc((r.created_at || "").slice(0, 10))}</p>
        <form method="POST" action="/admin/action" class="actions">
          <input type="hidden" name="id" value="${esc(r.id)}" />
          <a class="link" href="/file/gpx/${esc(r.id)}.gpx">view gpx</a>
          ${r.status !== "published" ? `<button name="action" value="approve" class="ok">Approve</button>` : ""}
          ${r.status !== "rejected" ? `<button name="action" value="reject">Reject</button>` : ""}
          <button name="action" value="remove" class="danger" onclick="return confirm('Delete permanently?')">Delete</button>
        </form>
        <details class="edit">
          <summary>Edit details</summary>
          <form method="POST" action="/admin/edit" class="editform">
            <input type="hidden" name="id" value="${esc(r.id)}" />
            <label>Name<input name="name" value="${esc(r.name)}" required /></label>
            <label>Region<input name="region" value="${esc(r.region)}" required /></label>
            <label>Country<input name="country" value="${esc(r.country) || "Australia"}" /></label>
            <label>Terrain
              <select name="difficulty">
                ${["easy", "moderate", "hard"]
                  .map((d) => `<option value="${d}"${r.difficulty === d ? " selected" : ""}>${d}</option>`)
                  .join("")}
              </select>
            </label>
            <label>Surface<input name="surface" value="${esc(r.surface)}" /></label>
            <label>Distance (km)<input name="distance_km" type="number" step="0.1" value="${r.distance_km ?? ""}" /></label>
            <label>Elevation (m)<input name="elevation_gain_m" type="number" step="1" value="${r.elevation_gain_m ?? ""}" /></label>
            <label>Contributor<input name="contributor" value="${esc(r.contributor)}" /></label>
            <label class="full">Description<textarea name="description" rows="3">${esc(r.description)}</textarea></label>
            <button class="ok" type="submit">Save changes</button>
          </form>
        </details>
      </div>
    </article>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bush Riding — Moderation</title><style>
  body{font-family:system-ui,sans-serif;margin:0;background:#f4efe2;color:#2c2a24}
  header{padding:18px 24px;border-bottom:1px solid #d8cfb8;background:#fff}
  h1{font-size:18px;margin:0}
  .count{color:#6f7c53;font-size:13px}
  main{max-width:760px;margin:0 auto;padding:20px}
  .card{display:flex;gap:16px;background:#fff;border:1px solid #d8cfb8;border-radius:4px;padding:14px;margin-bottom:14px}
  .card.published{border-left:4px solid #234a25}
  .card.pending{border-left:4px solid #d7a21a}
  .card.rejected{opacity:.6}
  .shape{flex:0 0 160px}
  .meta{flex:1}
  h3{margin:0 0 4px;font-size:16px}
  .badge{font-size:10px;text-transform:uppercase;letter-spacing:.06em;background:#ece5d2;padding:2px 6px;border-radius:3px;color:#6f7c53}
  .sub{margin:0 0 6px;color:#5a5346;font-size:13px}
  .desc{margin:0 0 6px;font-size:13px}
  .by{margin:0 0 10px;color:#8a8068;font-size:12px}
  .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  button{font:inherit;font-size:13px;padding:6px 12px;border:1px solid #2c2a24;background:#fff;border-radius:3px;cursor:pointer}
  button.ok{background:#234a25;color:#fff;border-color:#234a25}
  button.danger{border-color:#9b3a2f;color:#9b3a2f}
  .link{font-size:12px;color:#6f7c53}
  .edit{margin-top:10px}
  .edit>summary{font-size:12px;color:#6f7c53;cursor:pointer}
  .editform{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:10px;padding-top:10px;border-top:1px solid #ece5d2}
  .editform label{display:flex;flex-direction:column;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a8068;gap:3px}
  .editform .full{grid-column:1 / -1}
  .editform input,.editform select,.editform textarea{font:inherit;font-size:13px;padding:6px 8px;border:1px solid #d8cfb8;border-radius:3px;color:#2c2a24;background:#fff;text-transform:none;letter-spacing:0}
  .editform button{grid-column:1 / -1;justify-self:start}
</style></head><body>
<header><h1>Bush Riding — Route Moderation</h1><div class="count">${pending} pending · ${rows.length} total</div></header>
<main>${rows.length ? rows.map(card).join("") : "<p>No submissions yet.</p>"}</main>
</body></html>`;
}
