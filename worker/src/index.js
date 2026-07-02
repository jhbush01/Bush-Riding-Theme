// Bush Riding Map — community routes Worker.
// Endpoints:
//   POST /submit        public: accept a GPX submission (status=pending)
//   GET  /routes        public: approved community routes as GeoJSON (for the map)
//   GET  /file/<key>    public: serve a stored GPX/photo from R2
//   GET  /events        public: Community Bush Ride events as GeoJSON
//   GET  /admin         private: Basic-auth admin page (routes + events)
//   POST /admin/action  private: approve / reject / remove a submission
//   POST /admin/edit    private: edit a published route's metadata in place
//   POST /admin/event/save    private: create or edit an event
//   POST /admin/event/delete  private: delete an event
//
// Bindings (wrangler.jsonc): DB (D1), BUCKET (R2).
// Secret: ADMIN_TOKEN (the admin password).
// Vars: ALLOWED_ORIGINS, PUBLIC_URL, SITE_URL (map site, for the admin events list).

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
      if (url.pathname === "/events" && request.method === "GET") return eventsEndpoint(env, cors);
      if (url.pathname.startsWith("/file/") && request.method === "GET") return serveFile(url, env, cors);
      if (url.pathname === "/admin" && request.method === "GET") return adminPage(request, env);
      if (url.pathname === "/admin/action" && request.method === "POST") return adminAction(request, env);
      if (url.pathname === "/admin/edit" && request.method === "POST") return adminEdit(request, env);
      if (url.pathname === "/admin/event/save" && request.method === "POST") return adminEventSave(request, env);
      if (url.pathname === "/admin/event/delete" && request.method === "POST") return adminEventDelete(request, env);
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

/* ---------------- Community Bush Ride events ----------------
   Events are stored in D1 and managed from /admin (create / edit / delete),
   mirroring the route moderation flow. data/events.geojson in the repo is only
   an initial seed (loaded once into D1) and the front-end's offline fallback. */
const EVENT_COLS = [
  "id", "name", "subtitle", "date_iso", "date_display", "time", "meeting_point",
  "pace", "strava_url", "interested_count", "route_id", "description", "kit_note",
  "hero_key", "hero_ref", "status", "lng", "lat", "updated_at",
];

async function ensureEventsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS events (
       id TEXT PRIMARY KEY,
       name TEXT, subtitle TEXT, date_iso TEXT, date_display TEXT, time TEXT,
       meeting_point TEXT, pace TEXT, strava_url TEXT, interested_count INTEGER,
       route_id TEXT, description TEXT, kit_note TEXT, hero_key TEXT, hero_ref TEXT,
       status TEXT, lng REAL, lat REAL, updated_at TEXT
     )`
  ).run();
}

function eventUpsertSql() {
  const set = EVENT_COLS.filter((c) => c !== "id")
    .map((c) => `${c}=excluded.${c}`)
    .join(", ");
  return `INSERT INTO events (${EVENT_COLS.join(", ")})
          VALUES (${EVENT_COLS.map(() => "?").join(", ")})
          ON CONFLICT(id) DO UPDATE SET ${set}`;
}

async function upsertEvent(env, e) {
  const vals = EVENT_COLS.map((c) => (c === "updated_at" ? new Date().toISOString() : e[c] ?? null));
  await env.DB.prepare(eventUpsertSql()).bind(...vals).run();
}

// Seed D1 from the site's events.geojson the first time (empty table). Resolves
// each event's route by name against published community routes when possible.
//
// Seeding happens exactly ONCE (tracked by a marker), never "whenever the
// table is empty" — otherwise deleting the last event would immediately
// re-seed it from the geojson and the delete would never stick.
async function ensureMetaTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)"
  ).run();
}

async function seedEventsIfEmpty(env) {
  await ensureMetaTable(env);
  const marker = await env.DB.prepare("SELECT value FROM meta WHERE key='events_seeded'").first();
  if (marker) return; // already seeded once — respect deletions, even to empty

  // First run. If the table already holds events (seeded by the earlier
  // version), just record the marker and don't re-seed.
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM events").first();
  if (row && row.n > 0) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('events_seeded', '1')"
    ).run();
    return;
  }

  const site = (env.SITE_URL || "https://bushridingmap.com").replace(/\/$/, "");
  let fc;
  try {
    const res = await fetch(site + "/data/events.geojson", { cf: { cacheTtl: 0 } });
    if (!res.ok) return; // don't set the marker; retry next time
    fc = await res.json();
  } catch {
    return;
  }
  for (const f of fc.features || []) {
    const p = f.properties || {};
    const c = (f.geometry && f.geometry.coordinates) || [0, 0];
    let routeId = p.route_id || "";
    if (p.route_name) {
      const r = await env.DB.prepare(
        "SELECT id FROM submissions WHERE name=? AND status='published' LIMIT 1"
      )
        .bind(p.route_name)
        .first();
      if (r) routeId = r.id;
    }
    await upsertEvent(env, {
      id: p.id || "cbr-" + rand(6),
      name: p.name || "Community Bush Ride",
      subtitle: p.subtitle || "",
      date_iso: p.date_iso || "",
      date_display: p.date_display || "",
      time: p.time || "",
      meeting_point: p.meeting_point || "",
      pace: p.pace || "",
      strava_url: p.strava_url || "",
      interested_count: p.interested_count ?? 0,
      route_id: routeId,
      description: p.description || "",
      kit_note: p.kit_note || "",
      hero_key: null,
      hero_ref: p.hero_image || "",
      status: p.status === "past" ? "past" : "upcoming",
      lng: c[0],
      lat: c[1],
    });
  }
  await env.DB.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('events_seeded', '1')"
  ).run();
}

function eventFeature(r, base) {
  const heroBase = (base || "").replace(/\/$/, "");
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [r.lng, r.lat] },
    properties: {
      id: r.id,
      name: r.name,
      subtitle: r.subtitle,
      date_iso: r.date_iso,
      date_display: r.date_display,
      time: r.time,
      meeting_point: r.meeting_point,
      pace: r.pace,
      strava_url: r.strava_url,
      interested_count: r.interested_count ?? 0,
      route_id: r.route_id,
      description: r.description,
      kit_note: r.kit_note,
      status: r.status || "upcoming",
      hero_image: r.hero_key ? `${heroBase}/file/${r.hero_key}` : r.hero_ref || "",
    },
  };
}

// Public: all events as a GeoJSON FeatureCollection. No-store so admin edits
// show on the map immediately.
async function eventsEndpoint(env, cors) {
  await ensureEventsTable(env);
  await seedEventsIfEmpty(env);
  const { results } = await env.DB.prepare("SELECT * FROM events ORDER BY date_iso").all();
  const base = (env.PUBLIC_URL || "").replace(/\/$/, "");
  const features = (results || []).map((r) => eventFeature(r, base));
  return json({ type: "FeatureCollection", features }, 200, { ...cors, "Cache-Control": "no-store" });
}

// Admin: create or edit an event (multipart form). An empty id creates a new
// event; the hero image is optional (upload to R2, or a filename/URL in
// hero_ref). Existing hero is preserved when neither is supplied.
async function adminEventSave(request, env) {
  if (!requireAuth(request, env)) return authChallenge();
  await ensureEventsTable(env);
  const form = await request.formData();
  const subtitle = (form.get("subtitle") || "").toString().trim().slice(0, 120);
  let id = (form.get("id") || "").toString().trim();
  if (!id) id = "cbr-" + slug(subtitle || "event") + "-" + rand(4);

  const cur = await env.DB.prepare("SELECT hero_key, hero_ref FROM events WHERE id=?").bind(id).first();
  let heroKey = cur ? cur.hero_key : null;
  let heroRef = cur ? cur.hero_ref : "";
  const refInput = (form.get("hero_ref") || "").toString().trim();
  if (refInput) {
    heroRef = refInput;
    heroKey = null; // an explicit reference replaces a prior upload
  }
  const heroFile = form.get("hero");
  if (heroFile && typeof heroFile.arrayBuffer === "function" && heroFile.size > 0) {
    if (heroFile.size > MAX_PHOTO) return json({ error: "Image too large (max 6 MB)." }, 400, corsHeaders());
    const type = heroFile.type || "image/jpeg";
    if (!/^image\//.test(type)) return json({ error: "Hero must be an image." }, 400, corsHeaders());
    heroKey = `events/${id}.${type.includes("png") ? "png" : "jpg"}`;
    await env.BUCKET.put(heroKey, await heroFile.arrayBuffer(), { httpMetadata: { contentType: type } });
    heroRef = ""; // upload wins
  }

  const routeId = (form.get("route_id") || "").toString().trim();
  let lng = parseFloat(form.get("lng"));
  let lat = parseFloat(form.get("lat"));
  // If coordinates are blank/invalid — or the null-island default (0,0) — fall
  // back to the linked route's location so the pin actually lands on the map.
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || (lng === 0 && lat === 0)) {
    const pt = await resolveRoutePoint(env, routeId);
    if (pt) {
      lng = pt.lng;
      lat = pt.lat;
    } else {
      lng = Number.isFinite(lng) ? lng : 0;
      lat = Number.isFinite(lat) ? lat : 0;
    }
  }
  const count = parseInt(form.get("interested_count"), 10);
  await upsertEvent(env, {
    id,
    name: (form.get("name") || "Community Bush Ride").toString().trim().slice(0, 80),
    subtitle,
    date_iso: (form.get("date_iso") || "").toString().trim(),
    date_display: (form.get("date_display") || "").toString().trim().slice(0, 80),
    time: (form.get("time") || "").toString().trim().slice(0, 40),
    meeting_point: (form.get("meeting_point") || "").toString().trim().slice(0, 160),
    pace: (form.get("pace") || "").toString().trim().slice(0, 160),
    strava_url: (form.get("strava_url") || "").toString().trim().slice(0, 400),
    interested_count: Number.isFinite(count) && count >= 0 ? count : 0,
    route_id: routeId,
    description: (form.get("description") || "").toString().trim().slice(0, 2000),
    kit_note: (form.get("kit_note") || "").toString().trim().slice(0, 400),
    hero_key: heroKey,
    hero_ref: heroRef,
    status: (form.get("status") || "upcoming").toString() === "past" ? "past" : "upcoming",
    lng,
    lat,
  });
  return new Response(null, { status: 303, headers: { Location: "/admin#events" } });
}

// Resolve a meeting point [lng,lat] from a linked route: the community
// submission's marker (or first track point), else the curated routes.geojson.
async function resolveRoutePoint(env, routeId) {
  if (!routeId) return null;
  try {
    const r = await env.DB.prepare(
      "SELECT marker_lng, marker_lat, coords FROM submissions WHERE id=? AND status='published'"
    )
      .bind(routeId)
      .first();
    if (r) {
      if (Number.isFinite(r.marker_lng) && Number.isFinite(r.marker_lat)) {
        return { lng: r.marker_lng, lat: r.marker_lat };
      }
      if (r.coords) {
        const c = JSON.parse(r.coords);
        if (Array.isArray(c) && c.length) return { lng: c[0][0], lat: c[0][1] };
      }
    }
  } catch {
    /* fall through to curated */
  }
  try {
    const site = (env.SITE_URL || "https://bushridingmap.com").replace(/\/$/, "");
    const res = await fetch(site + "/data/routes.geojson", { cf: { cacheTtl: 0 } });
    if (res.ok) {
      const fc = await res.json();
      const f = (fc.features || []).find((x) => x.properties && x.properties.id === routeId);
      if (f) {
        const m = f.properties.marker || (f.geometry && f.geometry.coordinates && f.geometry.coordinates[0]);
        if (m) return { lng: m[0], lat: m[1] };
      }
    }
  } catch {
    /* give up */
  }
  return null;
}

async function adminEventDelete(request, env) {
  if (!requireAuth(request, env)) return authChallenge();
  await ensureEventsTable(env);
  const form = await request.formData();
  const id = (form.get("id") || "").toString();
  const row = await env.DB.prepare("SELECT hero_key FROM events WHERE id=?").bind(id).first();
  if (row && row.hero_key) await env.BUCKET.delete(row.hero_key);
  await env.DB.prepare("DELETE FROM events WHERE id=?").bind(id).run();
  return new Response(null, { status: 303, headers: { Location: "/admin#events" } });
}

// Full event rows for the admin page.
async function loadEventList(env) {
  await ensureEventsTable(env);
  await seedEventsIfEmpty(env);
  const { results } = await env.DB.prepare("SELECT * FROM events ORDER BY date_iso").all();
  return results || [];
}

// Route <select> options for the admin event form: community (D1) + curated.
async function routeOptions(env) {
  const opts = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name FROM submissions WHERE status='published' ORDER BY name"
    ).all();
    for (const r of results || []) opts.push({ id: r.id, name: `${r.name} (community)` });
  } catch {
    /* ignore */
  }
  const site = (env.SITE_URL || "https://bushridingmap.com").replace(/\/$/, "");
  try {
    const res = await fetch(site + "/data/routes.geojson", { cf: { cacheTtl: 0 } });
    if (res.ok) {
      const fc = await res.json();
      for (const f of fc.features || []) opts.push({ id: f.properties.id, name: `${f.properties.name} (curated)` });
    }
  } catch {
    /* ignore */
  }
  return opts;
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
  const events = await loadEventList(env);
  const routeOpts = await routeOptions(env);
  return new Response(adminHtml(results || [], events, routeOpts), {
    // Never cache the admin panel — always reflect the latest deploy + data.
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
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

function adminHtml(rows, events = [], routeOpts = []) {
  const pending = rows.filter((r) => r.status === "pending").length;
  const routeSelect = (sel) =>
    `<select name="route_id"><option value="">— none —</option>${routeOpts
      .map((o) => `<option value="${esc(o.id)}"${o.id === sel ? " selected" : ""}>${esc(o.name)}</option>`)
      .join("")}${
      sel && !routeOpts.some((o) => o.id === sel)
        ? `<option value="${esc(sel)}" selected>${esc(sel)} (current)</option>`
        : ""
    }</select>`;
  // One form covers both create (blank id) and edit (existing event).
  const eventForm = (e) => {
    const v = (k) => esc(e[k] != null ? String(e[k]) : "");
    const isNew = !e.id;
    return `
      <form method="POST" action="/admin/event/save" enctype="multipart/form-data" class="editform" style="margin-top:0">
        <input type="hidden" name="id" value="${v("id")}" />
        <label>Ride name (subtitle)<input name="subtitle" value="${v("subtitle")}" required /></label>
        <label>Status
          <select name="status">
            ${["upcoming", "past"]
              .map((s) => `<option value="${s}"${e.status === s ? " selected" : ""}>${s}</option>`)
              .join("")}
          </select>
        </label>
        <label>Date (ISO)<input name="date_iso" type="date" value="${v("date_iso")}" /></label>
        <label>Date (display)<input name="date_display" value="${v("date_display")}" placeholder="Saturday 2 August" /></label>
        <label>Time<input name="time" value="${v("time")}" placeholder="6:30am" /></label>
        <label>Meeting point<input name="meeting_point" value="${v("meeting_point")}" /></label>
        <label>Meet lng (optional)<input name="lng" type="number" step="any" value="${v("lng")}" placeholder="uses route location" /></label>
        <label>Meet lat (optional)<input name="lat" type="number" step="any" value="${v("lat")}" placeholder="uses route location" /></label>
        <label>Route ${routeSelect(e.route_id || "")}</label>
        <label>Interested<input name="interested_count" type="number" min="0" value="${e.interested_count ?? 0}" /></label>
        <label class="full">Strava event URL<input name="strava_url" value="${v("strava_url")}" placeholder="https://strava.app.link/…" /></label>
        <label class="full">Pace<input name="pace" value="${v("pace")}" /></label>
        <label class="full">Kit note<input name="kit_note" value="${v("kit_note")}" /></label>
        <label class="full">Description<textarea name="description" rows="3">${v("description")}</textarea></label>
        <label>Hero image (upload)<input name="hero" type="file" accept="image/*" /></label>
        <label>…or image filename/URL<input name="hero_ref" placeholder="leave blank to keep current" /></label>
        <button class="ok" type="submit">${isNew ? "Create event" : "Save changes"}</button>
      </form>`;
  };
  const eventCard = (e) => `
    <article class="card ${esc(e.status)}">
      <div class="meta">
        <h3>${esc(e.subtitle) || esc(e.id)} <span class="badge">${esc(e.status)}</span></h3>
        <p class="sub">${esc(e.date_display)} · ${e.interested_count ?? 0} interested · route: ${esc(e.route_id) || "—"}</p>
        <details class="edit">
          <summary>Edit event</summary>
          ${eventForm(e)}
        </details>
        <form method="POST" action="/admin/event/delete" class="actions" style="margin-top:8px">
          <input type="hidden" name="id" value="${esc(e.id)}" />
          <button name="delete" value="1" class="danger" onclick="return confirm('Delete this event?')">Delete event</button>
        </form>
      </div>
    </article>`;
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
  .card.upcoming{border-left:4px solid #c1572e}
  .card.past{opacity:.6;border-left:4px solid #8f8a7e}
  .shape{flex:0 0 160px}
  .meta{flex:1}
  h3{margin:0 0 4px;font-size:16px}
  .badge{font-size:10px;text-transform:uppercase;letter-spacing:.06em;background:#ece5d2;padding:2px 6px;border-radius:3px;color:#6f7c53}
  .sub{margin:0 0 6px;color:#5a5346;font-size:13px}
  .desc{margin:0 0 6px;font-size:13px}
  .by{margin:0 0 10px;color:#8a8068;font-size:12px}
  .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .actions .inline{display:flex;gap:8px;align-items:flex-end}
  .mini{display:flex;flex-direction:column;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8a8068;gap:3px}
  .mini input{font:inherit;font-size:13px;padding:5px 7px;border:1px solid #d8cfb8;border-radius:3px;width:80px}
  .tabs{display:flex;gap:6px;margin-top:12px}
  .tab{font:inherit;font-size:13px;font-weight:600;padding:8px 16px;border:1px solid #d8cfb8;background:#f4efe2;color:#6f7c53;border-radius:999px;cursor:pointer}
  .tab.is-active{background:#234a25;border-color:#234a25;color:#fff}
  .tabpanel[hidden]{display:none}
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
<header>
  <h1>Bush Riding — Admin</h1>
  <div class="count">${pending} pending · ${rows.length} routes · ${events.length} events</div>
  <nav class="tabs" role="tablist">
    <button class="tab is-active" data-tab="routes" type="button">Route moderation</button>
    <button class="tab" data-tab="events" type="button">Events</button>
  </nav>
</header>
<main id="tab-routes" class="tabpanel">${rows.length ? rows.map(card).join("") : "<p>No submissions yet.</p>"}</main>
<main id="tab-events" class="tabpanel" hidden>
  <article class="card upcoming">
    <div class="meta">
      <h3>New event</h3>
      <details class="edit">
        <summary>Create event</summary>
        ${eventForm({ status: "upcoming", interested_count: 0 })}
      </details>
    </div>
  </article>
  ${events.length ? events.map(eventCard).join("") : "<p>No events yet — create one above.</p>"}
</main>
<script>
  (function () {
    var tabs = document.querySelectorAll(".tab");
    function show(name) {
      tabs.forEach(function (t) { t.classList.toggle("is-active", t.dataset.tab === name); });
      document.getElementById("tab-routes").hidden = name !== "routes";
      document.getElementById("tab-events").hidden = name !== "events";
    }
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        show(t.dataset.tab);
        history.replaceState(null, "", t.dataset.tab === "events" ? "#events" : "#routes");
      });
    });
    show(location.hash === "#events" ? "events" : "routes");
  })();
</script>
</body></html>`;
}
