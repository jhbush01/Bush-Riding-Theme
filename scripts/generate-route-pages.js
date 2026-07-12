/**
 * Bush Map — static route page generator (SEO Phase 1).
 *
 * Reads the published community routes and emits one crawlable, JS-free HTML
 * page per route under map/routes/{state}/{region}/{id}/, plus aggregation
 * pages at /routes/, /routes/{state}/ and /routes/{state}/{region}/.
 *
 * Data source (single source of truth = the live community API, so current and
 * future routes are structured identically):
 *   1. BRM_ROUTES_FILE env  → read that local GeoJSON/JSON file (used for tests)
 *   2. else fetch BRM_ROUTES_API (default https://map-api.bushriding.cc/routes)
 *   3. else fall back to the committed map/data/routes.geojson
 * A fetch failure never fails the build — it falls back so a deploy still ships.
 *
 * Pure Node (no deps, no bundler, no headless browser). Run: `npm run build:seo`.
 */

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MAP_DIR = path.join(ROOT, "map");
const OUT_DIR = path.join(MAP_DIR, "routes");
const SITE = (process.env.BRM_SITE || "https://map.bushriding.cc").replace(/\/$/, "");
const ROUTES_API = process.env.BRM_ROUTES_API || "https://map-api.bushriding.cc/routes";
const ROUTES_FILE = process.env.BRM_ROUTES_FILE || "";
// GPX (for the route-shape map + elevation profile). Fetched from each route's
// gpx_url at build; BRM_GPX_DIR points at local <id>.gpx files for offline tests.
const GPX_DIR = process.env.BRM_GPX_DIR || "";
// Community events (for the /events/ directory). Live from the Worker; falls
// back to the committed seed. BRM_EVENTS_FILE overrides for offline tests.
const EVENTS_API = process.env.BRM_EVENTS_API || "https://map-api.bushriding.cc/events";
const EVENTS_FILE = process.env.BRM_EVENTS_FILE || "";

async function loadEvents() {
  try {
    let raw;
    if (EVENTS_FILE) {
      raw = JSON.parse(fs.readFileSync(EVENTS_FILE, "utf8"));
    } else {
      const res = await fetch(EVENTS_API, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      raw = await res.json();
    }
    return (raw.features || []).map((f) => f.properties || {}).filter((p) => p.id);
  } catch (_) {
    try {
      const fb = JSON.parse(fs.readFileSync(path.join(MAP_DIR, "data", "events.geojson"), "utf8"));
      return (fb.features || []).map((f) => f.properties || {}).filter((p) => p.id);
    } catch {
      return [];
    }
  }
}
// Reviews (for the page's photo gallery + aggregate rating). The public reviews
// endpoint is served same-origin via the Pages proxy; at build time we reach it
// on the currently-live site. BRM_REVIEWS_FILE (JSON: {route_id: {reviews...}})
// overrides for offline tests.
const REVIEWS_API = process.env.BRM_REVIEWS_API || `${SITE}/diary-api/reviews`;
const REVIEWS_FILE = process.env.BRM_REVIEWS_FILE || "";
let REVIEWS_FIXTURE = null;

async function loadReviews(routeId) {
  const empty = { count: 0, average: 0, reviews: [] };
  try {
    if (REVIEWS_FILE) {
      if (!REVIEWS_FIXTURE) REVIEWS_FIXTURE = JSON.parse(fs.readFileSync(REVIEWS_FILE, "utf8"));
      return REVIEWS_FIXTURE[routeId] || empty;
    }
    const res = await fetch(`${REVIEWS_API}?route_id=${encodeURIComponent(routeId)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return empty;
    const d = await res.json();
    return { count: d.count || 0, average: d.average || 0, reviews: d.reviews || [] };
  } catch (_) {
    return empty; // reviews are additive — never fail the build over them
  }
}

/* ---------------- taxonomy (mirrors the live route card) ---------------- */
const TERRAIN_LABEL = {
  groomed: "Groomed", rocky: "Rocky", "proper-mud": "Proper Mud",
  easy: "Groomed", moderate: "Rocky", hard: "Proper Mud",
};
const TERRAIN_DESC = {
  Groomed: "mostly smooth, well-formed gravel that rolls fast",
  Rocky: "chunkier, rougher gravel with loose or rocky sections",
  "Proper Mud": "soft, muddy or technical surfaces that can get messy when wet",
};
const EFFORT_DESC = {
  Cruisy: "an easygoing ride most riders will handle comfortably",
  "Big day out": "a solid outing with real distance or climbing — pack for a full day",
  "Character building": "a genuinely demanding ride with big distance and climbing",
};
const STATE_FULL = {
  QLD: "Queensland", NSW: "New South Wales", VIC: "Victoria", TAS: "Tasmania",
  SA: "South Australia", WA: "Western Australia", NT: "Northern Territory",
  ACT: "Australian Capital Territory",
};

function terrainLabel(v) {
  const s = String(v || "").toLowerCase();
  return TERRAIN_LABEL[s] || (v ? cap(String(v)) : "");
}
// Effort derived from distance + climb (identical thresholds to map.js).
function effortLabel(distKm, elevM) {
  const d = +distKm, e = +elevM;
  if (!isFinite(d) && !isFinite(e)) return "";
  if (d > 120 && e > 750) return "Character building";
  if (d >= 75 || e > 750) return "Big day out";
  return "Cruisy";
}

/* ---------------- helpers ---------------- */
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function slug(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmt(n) { return Math.round(+n).toLocaleString("en-US"); }
function stars(n) { const r = Math.max(0, Math.min(5, Math.round(+n) || 0)); return "★".repeat(r) + "☆".repeat(5 - r); }
// JSON-LD: escape "<" so a "</script>" inside a value can't break out of the tag.
function ld(obj) { return JSON.stringify(obj, null, 2).replace(/</g, "\\u003c"); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

/* ---------------- data ---------------- */
async function loadFeatures() {
  let raw = null, source = "";
  if (ROUTES_FILE) {
    raw = JSON.parse(fs.readFileSync(ROUTES_FILE, "utf8"));
    source = `file ${ROUTES_FILE}`;
  } else {
    try {
      const res = await fetch(ROUTES_API, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      raw = await res.json();
      source = `live API ${ROUTES_API}`;
    } catch (e) {
      console.warn(`! Could not fetch ${ROUTES_API} (${e.message}). Falling back to committed geojson.`);
      const fb = path.join(MAP_DIR, "data", "routes.geojson");
      raw = JSON.parse(fs.readFileSync(fb, "utf8"));
      source = `fallback ${path.relative(ROOT, fb)}`;
      usedErrorFallback = true;
    }
  }
  const features = (raw.features || []).filter((f) => (f.properties || {}).status === "published");
  console.log(`  source: ${source} — ${features.length} published route(s)`);
  return features;
}
let usedErrorFallback = false;

// Normalise a GeoJSON feature (API or file shape) into a flat route model.
function normalize(f) {
  const p = f.properties || {};
  const coords = (f.geometry && f.geometry.type === "LineString" && f.geometry.coordinates) || [];
  const marker = Array.isArray(p.marker) ? p.marker : coords[0] || null;

  // state/region: the API sends them split; the old geojson combined them as
  // "Region, QLD". Handle both.
  let state = (p.state || "").trim();
  let region = (p.region || "").trim();
  if (!state) {
    const m = region.match(/,\s*([A-Za-z]{2,3})\s*$/);
    if (m) { state = m[1].toUpperCase(); region = region.replace(/,\s*[A-Za-z]{2,3}\s*$/, "").trim(); }
  }
  state = state.toUpperCase();

  const distance = +p.distance_km;
  const elevation = +p.elevation_gain_m;
  return {
    id: p.id || slug(p.name),
    name: p.name || "Untitled route",
    state, stateFull: STATE_FULL[state] || state || "Australia",
    region, regionLabel: region || "Unknown area",
    stateSlug: slug(state) || "au",
    regionSlug: slug(region) || "other",
    distance, elevation,
    terrain: terrainLabel(p.terrain_difficulty),
    effort: effortLabel(distance, elevation),
    surface: (p.surface || "").trim(),
    description: (p.description || "").trim(),
    contributor: (p.contributed_by || p.vetted_by || "").trim(),
    contributorUrl: (p.contributor_url || "").trim(),
    startNote: (p.start_note || "").trim(), // not in current data — reserved
    lat: marker ? marker[1] : null,
    lng: marker ? marker[0] : null,
    hero: normUrl(p.photo_url, `/public/${p.id}.jpg`),
    gpx: normUrl(p.gpx_url, `/gpx/${p.id}.gpx`),
  };
}
function normUrl(v, fallback) {
  v = (v || "").trim();
  if (!v) return fallback;
  if (/^https?:\/\//i.test(v)) return v;
  return "/" + v.replace(/^\/+/, "");
}
function routePath(r) { return `/routes/${r.stateSlug}/${r.regionSlug}/${r.id}`; }
function absImg(u) { return /^https?:\/\//i.test(u) ? u : SITE + u; }

/* ---------------- shared chrome (consistent with the map site) ---------------- */
function head(opts) {
  const canonical = SITE + opts.path;
  const ogImg = absImg(opts.image || "/public/og-card.jpg");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta name="theme-color" content="#E9E2D0" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<meta property="og:site_name" content="Bush Riding" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(ogImg)}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/styles/app.css" />
<style>${PAGE_CSS}</style>
${opts.extraHead || ""}
${opts.jsonld ? `<script type="application/ld+json">\n${opts.jsonld}\n</script>` : ""}
</head>
<body class="seo-page">
${siteHeader()}
<main class="wrap">`;
}
function foot() {
  return `</main>
${siteFooter()}
</body>
</html>
`;
}
function siteHeader() {
  return `<header class="site-head">
  <a class="site-brand" href="/">Bush Map</a>
  <nav class="site-nav">
    <a href="/routes/">Community Routes</a>
    <a href="/events/">Bush Events</a>
    <a href="/">Map</a>
    <a href="/submit">Submit a route</a>
  </nav>
</header>`;
}
function siteFooter() {
  return `<footer class="site-foot">
  <p>Bush Map — community-vetted gravel routes across Australia. Routes are guides only; ride to conditions.</p>
  <p><a href="/routes/">All routes</a> · <a href="/">Interactive map</a> · <a href="/submit">Submit a route</a></p>
</footer>`;
}
function crumbs(items) {
  // items: [{name, url}] — last has no link.
  const parts = items.map((it, i) =>
    i < items.length - 1
      ? `<a href="${esc(it.url)}">${esc(it.name)}</a>`
      : `<span aria-current="page">${esc(it.name)}</span>`
  );
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join('<span class="crumbs__sep">›</span>')}</nav>`;
}
function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: SITE + it.url,
    })),
  };
}
function routeCard(r) {
  const heroStyle = r.hero ? "" : ' class="rp-card__hero rp-card__hero--empty"';
  const hero = r.hero
    ? `<img class="rp-card__hero" src="${esc(r.hero)}" alt="${esc(r.name)}" loading="lazy" width="640" height="360" />`
    : `<div${heroStyle} aria-hidden="true"></div>`;
  return `<a class="rp-card" href="${esc(routePath(r))}" data-state="${esc(r.stateSlug)}" data-region="${esc(r.regionSlug)}">
  ${hero}
  <div class="rp-card__body">
    <h3 class="rp-card__name">${esc(r.name)}</h3>
    <p class="rp-card__loc">${esc([r.regionLabel, r.state].filter(Boolean).join(", "))}</p>
    <p class="rp-card__stats">${esc(fmt(r.distance))} km${r.effort ? " · " + esc(r.effort) : ""}${r.terrain ? " · " + esc(r.terrain) : ""}</p>
  </div>
</a>`;
}

/* ---------------- FAQ ---------------- */
function faqItems(r) {
  const dist = fmt(r.distance), elev = fmt(r.elevation);
  const items = [
    {
      q: `How long is ${r.name}?`,
      a: `${r.name} is a ${dist} km gravel ride with about ${elev} m of climbing${r.effort ? `, which rates as ${r.effort.toLowerCase()}` : ""}.`,
    },
    {
      q: `Where do you start ${r.name}?`,
      a: r.startNote
        ? `${r.startNote} It's in the ${r.regionLabel} area${r.stateFull ? `, ${r.stateFull}` : ""}.`
        : `${r.name} starts in the ${r.regionLabel} area${r.stateFull ? `, ${r.stateFull}` : ""}. Open the interactive map for the exact start point and turn-by-turn track.`,
    },
    {
      q: `How difficult is ${r.name}?`,
      a: r.effort
        ? `${r.name} is ${r.effort} — ${EFFORT_DESC[r.effort] || "see the distance and climbing figures above"}.`
        : `See the distance and climbing figures above to judge the effort.`,
    },
    {
      q: `What surface is ${r.name}?`,
      a: `The terrain is ${r.terrain || "gravel"} — ${TERRAIN_DESC[r.terrain] || "mixed gravel surfaces"}.${r.surface ? ` Surface breakdown: ${r.surface}.` : ""}`,
    },
    {
      q: `Can I download a GPX file for ${r.name}?`,
      a: `Yes — download the GPX for ${r.name} to load onto your GPS computer or phone before you ride.`,
    },
  ];
  return items;
}

/* ---------------- GPX → route map + elevation ---------------- */
// Load a route's GPX and return { points:[{lat,lon,ele,d}], hasEle } (d = cumulative km).
async function loadGpx(r) {
  try {
    let text;
    if (GPX_DIR) {
      text = fs.readFileSync(path.join(GPX_DIR, `${r.id}.gpx`), "utf8");
    } else {
      const u = /^https?:\/\//.test(r.gpx) ? r.gpx : SITE + r.gpx;
      const res = await fetch(u, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) return null;
      text = await res.text();
    }
    const raw = parseGpxText(text);
    if (raw.length < 2) return null;
    let dist = 0, prev = null, hasEle = false;
    const points = [];
    for (const p of raw) {
      if (prev) dist += haversineKm(prev, p);
      prev = p;
      if (Number.isFinite(p.ele)) hasEle = true;
      points.push({ lat: p.lat, lon: p.lon, ele: p.ele, d: dist });
    }
    return { points, hasEle };
  } catch (_) {
    return null; // GPX is enhancement-only; never fail the build
  }
}

function parseGpxText(text) {
  const out = [];
  const re = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  let m;
  while ((m = re.exec(text))) {
    const attrs = m[1] || "", inner = m[2] || "";
    const lat = parseFloat((attrs.match(/\blat="([-\d.]+)"/) || [])[1]);
    const lon = parseFloat((attrs.match(/\blon="([-\d.]+)"/) || [])[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eleM = inner.match(/<ele>\s*([-\d.]+)\s*<\/ele>/);
    out.push({ lat, lon, ele: eleM ? parseFloat(eleM[1]) : NaN });
  }
  return out;
}
function haversineKm(a, b) {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function downsample(arr, max) {
  if (arr.length <= max) return arr;
  const step = arr.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}
// Inline SVG of the route's shape (GPS track), fit uniformly into the box with a
// start marker. Not a street basemap — a pure, dependency-free route diagram.
function routeMapSvg(points) {
  const W = 640, H = 380, pad = 26;
  const pts = downsample(points, 300);
  const latMean = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos((latMean * Math.PI) / 180) || 1; // lon scale so it isn't stretched
  const xs = pts.map((p) => p.lon * k), ys = pts.map((p) => p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const dx = maxX - minX || 1e-6, dy = maxY - minY || 1e-6;
  const scale = Math.min((W - 2 * pad) / dx, (H - 2 * pad) / dy);
  const offX = (W - dx * scale) / 2, offY = (H - dy * scale) / 2;
  const px = (lon) => offX + (lon * k - minX) * scale;
  const py = (lat) => H - (offY + (lat - minY) * scale);
  const d = "M" + pts.map((p) => `${px(p.lon).toFixed(1)},${py(p.lat).toFixed(1)}`).join(" L");
  const s = pts[0];
  return `<svg class="rp-map__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of the route">
    <rect width="${W}" height="${H}" fill="#ece4d2"/>
    <path d="${d}" fill="none" stroke="#b04a24" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${px(s.lon).toFixed(1)}" cy="${py(s.lat).toFixed(1)}" r="6.5" fill="#6f7c53" stroke="#fff" stroke-width="2.5"/>
  </svg>`;
}
// Inline SVG elevation profile (same gradient look as the interactive card).
function elevationSvg(points) {
  const withEle = points.filter((p) => Number.isFinite(p.ele));
  if (withEle.length < 2) return "";
  const prof = downsample(withEle, 220).map((p) => ({ d: p.d, e: p.ele }));
  const W = 680, top = 8, base = 120;
  const dMax = prof[prof.length - 1].d || 1;
  const es = prof.map((p) => p.e);
  let eMin = Math.min(...es), eMax = Math.max(...es);
  if (eMax - eMin < 10) eMax = eMin + 10;
  const x = (dd) => (dd / dMax) * W, y = (e) => base - ((e - eMin) / (eMax - eMin)) * (base - top);
  const seq = prof.map((p) => `${x(p.d).toFixed(1)},${y(p.e).toFixed(1)}`);
  return `<svg class="rp-elev__svg" viewBox="0 0 ${W} 130" preserveAspectRatio="none" role="img" aria-label="Elevation profile">
    <defs><linearGradient id="rpElev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9673f" stop-opacity=".34"/><stop offset="1" stop-color="#c9673f" stop-opacity=".04"/></linearGradient></defs>
    <path d="M0,${base} L${seq.join(" L")} L${W},${base} Z" fill="url(#rpElev)"/>
    <path d="M${seq.join(" L")}" fill="none" stroke="#bd5730" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

/* ---------------- individual route page ---------------- */
function routePage(r, reviews, gpx) {
  reviews = reviews || { count: 0, average: 0, reviews: [] };
  const revs = reviews.reviews || [];
  const photos = revs.filter((v) => v.photo_url);
  const url = routePath(r);
  const dist = fmt(r.distance), elev = fmt(r.elevation);
  const locLine = [r.regionLabel, r.stateFull].filter(Boolean).join(", ");
  const title = `${r.name} — ${dist}km Gravel Ride near ${r.regionLabel} | Bush Map`;
  const description = clampDesc(
    `${r.name} is a ${dist}km gravel route near ${r.regionLabel}, ${r.stateFull} with ${elev}m of climbing (${r.effort || "gravel"}, ${r.terrain || "gravel"}). Download the GPX and ride it.`
  );

  const crumbItems = [
    { name: "Bush Map", url: "/" },
    { name: "Routes", url: "/routes/" },
    { name: r.stateFull, url: `/routes/${r.stateSlug}/` },
    { name: r.regionLabel, url: `/routes/${r.stateSlug}/${r.regionSlug}/` },
    { name: r.name, url },
  ];
  const faqs = faqItems(r);

  const jsonld = [
    sportsActivityLd(r, url, reviews),
    breadcrumbLd(crumbItems),
    faqPageLd(faqs),
  ];

  const hero = r.hero
    ? `<img class="rp-hero__img" src="${esc(r.hero)}" alt="${esc(r.name)} — gravel route near ${esc(r.regionLabel)}" width="1200" height="675" loading="eager" />`
    : `<div class="rp-hero__img rp-hero__img--empty" aria-hidden="true"></div>`;

  // Google Maps directions to the start by default (works everywhere, no JS);
  // a tiny script swaps to Apple Maps on iPhone/iPad. A geo: URI was unreliable.
  const navHref = r.lat != null && r.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}` : "";
  const appleHref = r.lat != null && r.lng != null ? `https://maps.apple.com/?daddr=${r.lat},${r.lng}&dirflg=d` : "";

  const stat = (v, label) => `<div class="rp-stat"><span class="rp-stat__v">${esc(v)}</span><span class="rp-stat__l">${esc(label)}</span></div>`;

  // Interactive map (real basemap) with the GPX route drawn on it; the build-time
  // route-shape SVG stays as a no-JS fallback (shown until the map loads).
  const hasMap = gpx && gpx.points.length > 1;
  const mapCoords = hasMap ? downsample(gpx.points, 500).map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]) : [];
  const mapFig = hasMap
    ? `<figure class="rp-map" data-has-map>
    <div class="rp-map__live" id="rp-livemap"></div>
    <div class="rp-map__shape">${routeMapSvg(gpx.points)}</div>
    <figcaption class="rp-map__cap">${esc(r.name)} — ${fmt(r.distance)} km near ${esc(r.regionLabel)}, ${esc(r.stateFull)}</figcaption>
  </figure>`
    : "";
  const mapEmbed = hasMap
    ? `<script>window.__brmRoute=${JSON.stringify(mapCoords)};</script>
<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>
<script>${ROUTE_MAP_JS}</script>`
    : "";
  const elevSvgStr = gpx ? elevationSvg(gpx.points) : "";
  const elevBlock = elevSvgStr
    ? `<div class="rp-elev">
    <div class="rp-elev__head"><span class="rp-mini">Elevation profile</span><span class="rp-elev__note">↑ ${fmt(r.elevation)} m over ${fmt(r.distance)} km</span></div>
    ${elevSvgStr}
  </div>`
    : "";

  // Rider photo gallery (from reviews). Links to full-res so the page stays JS-free.
  const galleryHtml = photos.length
    ? `<h2>From riders</h2>
  <div class="rp-gallery">
    ${photos
      .map((v) => `<a class="rp-gallery__item" href="${esc(v.photo_url)}" target="_blank" rel="noopener"><img src="${esc(v.photo_url)}" alt="${esc(r.name)} — photo by ${esc(v.username || "a rider")}" loading="lazy" width="480" height="360" /></a>`)
      .join("\n    ")}
  </div>`
    : "";

  // Rider reviews (UGC — great for SEO). Only when there are reviews.
  const reviewsHtml = reviews.count
    ? `<h2>Rider reviews</h2>
  <p class="rp-rating"><span class="rp-rating__stars" aria-hidden="true">${stars(reviews.average)}</span> <strong>${reviews.average.toFixed(1)}</strong> · ${reviews.count} review${reviews.count === 1 ? "" : "s"}</p>
  <div class="rp-reviews">
    ${revs
      .map((v) => `<div class="rp-review"><p class="rp-review__head"><span class="rp-review__stars" aria-hidden="true">${stars(v.rating)}</span> <strong>${esc(v.username || "Rider")}</strong></p>${v.comment ? `<p class="rp-review__text">${esc(v.comment)}</p>` : ""}</div>`)
      .join("\n    ")}
  </div>`
    : "";

  const body = `
${crumbs(crumbItems)}

<article class="route">
  <figure class="rp-hero">${hero}</figure>

  <h1 class="rp-title">${esc(r.name)}</h1>
  <p class="rp-loc">${esc(locLine)}</p>

  <div class="rp-stats">
    ${stat(dist + " km", "Distance")}
    ${stat(elev + " m", "Elevation")}
    ${stat(r.effort || "—", "Effort")}
    ${stat(r.terrain || "—", "Terrain")}
  </div>

  ${elevBlock}

  <div class="rp-actions">
    <a class="button button--primary" href="${esc(r.gpx)}" download>Download GPX</a>
    ${navHref ? `<a class="button" id="rp-nav" href="${esc(navHref)}"${appleHref ? ` data-apple="${esc(appleHref)}"` : ""} target="_blank" rel="noopener">Navigate to start</a>` : ""}
    <a class="button" href="/map#${esc(r.id)}">Open in interactive map</a>
  </div>

  <p class="rp-start"><strong>Start:</strong> ${esc(r.regionLabel)}${r.startNote ? " — " + esc(r.startNote) : ""}.</p>

  <h2>About this route</h2>
  ${r.description ? descParagraphs(r.description) : `<p class="rp-desc">${esc(r.name)} is a ${dist} km gravel route near ${esc(r.regionLabel)}, ${esc(r.stateFull)}, with ${elev} m of climbing. Open the interactive map for the full turn-by-turn track, or download the GPX to load onto your head unit.</p>`}

  ${mapFig}

  <p class="rp-meta">${r.contributor ? `Vetted by ${r.contributorUrl ? `<a href="${esc(r.contributorUrl)}" rel="nofollow noopener">${esc(r.contributor)}</a>` : esc(r.contributor)}` : "Community-contributed route"}.</p>

  ${galleryHtml}

  ${reviewsHtml}

  <h2>Frequently asked questions</h2>
  <div class="rp-faq">
    ${faqs.map((f) => `<details class="rp-faq__item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n    ")}
  </div>

  <p class="rp-back"><a href="/map#${esc(r.id)}">See ${esc(r.name)} on the full interactive map →</a></p>
</article>
${mapEmbed}
${appleHref ? `<script>${NAV_SWAP_JS}</script>` : ""}`;

  const extraHead = hasMap ? `<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css" />` : "";
  return head({ title, description, path: url, image: r.hero || "/public/og-card.jpg", jsonld: ld(jsonld), extraHead }) + body + foot();
}

// Runs on the route page: draw the GPX route on a real (keyless OpenFreeMap)
// basemap and reveal it, replacing the static SVG fallback. If MapLibre or the
// tiles don't load, the SVG stays — the page never breaks.
const ROUTE_MAP_JS = `
(function(){
  var coords=window.__brmRoute;
  var el=document.getElementById('rp-livemap');
  if(!el||!window.maplibregl||!coords||coords.length<2) return;
  fetch('/styles/bush.json').then(function(r){return r.json();}).then(function(style){
    var map=new maplibregl.Map({container:el,style:style,attributionControl:true,cooperativeGestures:true,dragRotate:false});
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    map.on('load',function(){
      map.addSource('brm-route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
      map.addLayer({id:'brm-route-line',type:'line',source:'brm-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#b04a24','line-width':4}});
      var bounds=new maplibregl.LngLatBounds(coords[0],coords[0]);
      for(var i=1;i<coords.length;i++) bounds.extend(coords[i]);
      map.fitBounds(bounds,{padding:36,duration:0});
      new maplibregl.Marker({color:'#6f7c53'}).setLngLat(coords[0]).addTo(map);
      var fig=el.closest('.rp-map'); if(fig) fig.classList.add('is-live');
    });
  }).catch(function(){});
})();`;

// On iPhone/iPad, swap the "Navigate to start" link from Google Maps to Apple
// Maps. Google stays the no-JS default and covers every other device. iPadOS
// reports as "Macintosh" with touch points, so we catch that too — but not Mac
// desktops (no touch), matching the user's "on iPhone" intent.
const NAV_SWAP_JS = `
(function(){
  var a=document.getElementById('rp-nav');
  if(!a||!a.dataset.apple) return;
  var ua=navigator.userAgent||'';
  if(/iP(hone|ad|od)/.test(ua)||(/Macintosh/.test(ua)&&(navigator.maxTouchPoints||0)>1)) a.href=a.dataset.apple;
})();`;

// Render a route write-up as HTML paragraphs. Riders enter multi-paragraph
// notes in the submit/moderation textarea; without this the whole write-up
// collapses into one run-on block on the page. Blank lines start a new
// paragraph; single newlines become line breaks.
function descParagraphs(s) {
  return String(s || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p class="rp-desc">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n  ");
}

function clampDesc(s) {
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= 160) return s;
  return s.slice(0, 157).replace(/[\s,.;:]+\S*$/, "") + "…";
}

/* ---------------- JSON-LD builders ---------------- */
function sportsActivityLd(r, url, reviews) {
  const amenities = [
    ["Distance", `${fmt(r.distance)} km`],
    ["Elevation gain", `${fmt(r.elevation)} m`],
    r.effort ? ["Effort", r.effort] : null,
    r.terrain ? ["Terrain", r.terrain] : null,
  ].filter(Boolean);
  const obj = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: r.name,
    description: r.description || `${r.name} is a ${fmt(r.distance)} km gravel route near ${r.regionLabel}, ${r.stateFull}.`,
    url: SITE + url,
    sport: "Gravel Cycling",
    address: {
      "@type": "PostalAddress",
      addressRegion: r.stateFull,
      addressCountry: "AU",
    },
    amenityFeature: amenities.map(([n, v]) => ({
      "@type": "LocationFeatureSpecification",
      name: n,
      value: v,
    })),
  };
  if (r.hero) obj.image = absImg(r.hero);
  if (r.lat != null && r.lng != null) {
    obj.geo = { "@type": "GeoCoordinates", latitude: r.lat, longitude: r.lng };
  }
  // Real aggregate rating + a few reviews (only when they exist) — star-rating
  // rich results in search.
  if (reviews && reviews.count) {
    obj.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: reviews.average,
      reviewCount: reviews.count,
      bestRating: 5,
      worstRating: 1,
    };
    obj.review = (reviews.reviews || []).slice(0, 5).map((v) => ({
      "@type": "Review",
      author: { "@type": "Person", name: v.username || "Rider" },
      reviewRating: { "@type": "Rating", ratingValue: v.rating, bestRating: 5, worstRating: 1 },
      ...(v.comment ? { reviewBody: v.comment } : {}),
    }));
  }
  return obj;
}
function faqPageLd(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/* ---------------- aggregation pages ---------------- */
const ALL_INTRO =
  "Bush Map is a community-vetted collection of gravel-cycling routes across Australia. Every route is ridden and checked before it goes on the map, with a downloadable GPX, elevation and surface notes. Find your next dirt adventure below.";

function stateIntro(stateFull) {
  if (stateFull === "Queensland")
    return "Queensland's gravel riding runs from the pine forests and volcanic plugs of the south-east to the ranges further north. These community-vetted routes come with GPX files, elevation and surface detail so you can plan a ride with confidence.";
  return `Community-vetted gravel routes in ${stateFull}, each with a downloadable GPX, elevation and surface notes.`;
}
function regionIntro(regionLabel, stateFull) {
  return `Gravel routes in ${regionLabel}, ${stateFull}. Every ride below is community-vetted with a downloadable GPX, elevation profile and surface notes — sorted from shortest to longest so you can pick the right day out.`;
}

function itemListLd(routes, listUrl) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: routes.map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: r.name,
      url: SITE + routePath(r),
    })),
  };
}

function aggregatePage(opts) {
  // opts: {title, description, path, h1, intro, routes, crumbItems, extraLd, filter}
  const jsonld = ld([breadcrumbLd(opts.crumbItems)].concat(opts.extraLd || []));
  const cards = opts.routes.length
    ? `<div class="rp-cards" id="rp-cards">${opts.routes.map(routeCard).join("\n")}</div>`
    : `<p class="rp-empty">No published routes here yet — <a href="/submit">submit one</a>.</p>`;
  const filterUi = opts.filter && opts.routes.length ? routeFilterUi(opts.routes) : "";
  const body = `
${crumbs(opts.crumbItems)}
<h1 class="rp-title">${esc(opts.h1)}</h1>
<p class="rp-intro">${esc(opts.intro)}</p>
${filterUi}
${cards}
<p class="rp-noresult" id="rp-noresult" hidden>No routes match — try another state or region.</p>
${opts.filter && opts.routes.length ? `<script>${ROUTE_FILTER_JS}</script>` : ""}`;
  return head({ title: opts.title, description: opts.description, path: opts.path, jsonld }) + body + foot();
}

// Pill filter for the all-routes index: states first; picking one reveals its
// regions. Progressive enhancement — the cards render + are crawlable without JS.
function routeFilterUi(routes) {
  const states = [];
  const seen = new Set();
  for (const r of routes) {
    if (!seen.has(r.stateSlug)) {
      seen.add(r.stateSlug);
      states.push({ slug: r.stateSlug, label: r.stateFull });
    }
  }
  const statePills =
    `<button type="button" class="rp-pill is-active" data-state="">All states</button>` +
    states.map((s) => `<button type="button" class="rp-pill" data-state="${esc(s.slug)}">${esc(s.label)}</button>`).join("");
  return `<div class="rp-filter">
  <div class="rp-pills" id="rp-states">${statePills}</div>
  <div class="rp-pills rp-pills--region" id="rp-regions" hidden></div>
</div>`;
}

const ROUTE_FILTER_JS = `
(function(){
  var cards=[].slice.call(document.querySelectorAll('#rp-cards .rp-card'));
  var stateWrap=document.getElementById('rp-states'), regionWrap=document.getElementById('rp-regions');
  var noresult=document.getElementById('rp-noresult');
  if(!cards.length||!stateWrap) return;
  var curState='', curRegion='';
  var regionNames={};
  cards.forEach(function(c){
    var loc=c.querySelector('.rp-card__loc'); var reg=(loc?loc.textContent:'').split(',')[0].trim();
    if(reg) regionNames[c.getAttribute('data-region')]=reg;
  });
  function apply(){
    var n=0;
    cards.forEach(function(c){
      var ok=(!curState||c.getAttribute('data-state')===curState)&&(!curRegion||c.getAttribute('data-region')===curRegion);
      c.style.display=ok?'':'none'; if(ok)n++;
    });
    if(noresult) noresult.hidden=n>0;
  }
  function setActive(wrap,btn){ [].forEach.call(wrap.children,function(b){b.classList.toggle('is-active',b===btn);}); }
  function buildRegions(){
    var slugs={}; cards.forEach(function(c){ if(c.getAttribute('data-state')===curState) slugs[c.getAttribute('data-region')]=1; });
    var keys=Object.keys(slugs).sort(function(a,b){return (regionNames[a]||'').localeCompare(regionNames[b]||'');});
    if(!curState||keys.length<2){ regionWrap.hidden=true; regionWrap.innerHTML=''; return; }
    var html='<button type="button" class="rp-pill is-active" data-region="">All regions</button>';
    keys.forEach(function(k){ html+='<button type="button" class="rp-pill" data-region="'+k+'">'+(regionNames[k]||k)+'</button>'; });
    regionWrap.innerHTML=html; regionWrap.hidden=false;
  }
  stateWrap.addEventListener('click',function(e){
    var btn=e.target.closest('[data-state]'); if(!btn) return;
    curState=btn.getAttribute('data-state'); curRegion=''; setActive(stateWrap,btn); buildRegions(); apply();
  });
  regionWrap.addEventListener('click',function(e){
    var btn=e.target.closest('[data-region]'); if(!btn) return;
    curRegion=btn.getAttribute('data-region'); setActive(regionWrap,btn); apply();
  });
})();`;

/* ---------------- events directory (/events/) ---------------- */
const EVENTS_INTRO =
  "Community Bush Rides — social gravel rides run by the Bush Riding community. No one gets dropped. Find an upcoming ride below, check the route, and come along.";

function eventCard(e, routeById) {
  const route = e.route_id ? routeById.get(e.route_id) : null;
  const when = [e.date_display, e.time].filter(Boolean).join(" · ");
  const bits = [
    e.meeting_point ? `<span class="ev-card__row"><strong>Start:</strong> ${esc(e.meeting_point)}</span>` : "",
    e.pace ? `<span class="ev-card__row"><strong>Pace:</strong> ${esc(e.pace)}</span>` : "",
    route ? `<span class="ev-card__row"><strong>Route:</strong> <a href="${esc(routePath(route))}">${esc(route.name)}</a> · ${fmt(route.distance)} km</span>` : "",
  ].filter(Boolean).join("");
  const actions = [
    e.strava_url ? `<a class="button button--primary" href="${esc(e.strava_url)}" target="_blank" rel="noopener">Join on Strava</a>` : "",
    route ? `<a class="button" href="${esc(routePath(route))}">View route</a>` : "",
  ].filter(Boolean).join("");
  return `<article class="ev-card${e.status === "past" ? " is-past" : ""}">
    ${when ? `<p class="ev-card__when">${esc(when)}</p>` : ""}
    <h3 class="ev-card__name">${esc(e.subtitle || e.name || "Community Bush Ride")}</h3>
    ${e.description && !/^placeholder/i.test(e.description) ? `<p class="ev-card__desc">${esc(e.description)}</p>` : ""}
    <div class="ev-card__meta">${bits}</div>
    ${actions ? `<div class="ev-card__actions">${actions}</div>` : ""}
  </article>`;
}

function eventLd(e, routeById) {
  const route = e.route_id ? routeById.get(e.route_id) : null;
  const obj = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.subtitle || e.name || "Community Bush Ride",
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: SITE + "/events/",
    organizer: { "@type": "Organization", name: "Bush Map", url: SITE },
  };
  if (e.date_iso) obj.startDate = e.time ? `${e.date_iso}` : e.date_iso;
  if (e.meeting_point) {
    obj.location = { "@type": "Place", name: e.meeting_point };
    if (route) obj.location.address = { "@type": "PostalAddress", addressRegion: route.stateFull, addressCountry: "AU" };
  }
  if (e.description && !/^placeholder/i.test(e.description)) obj.description = e.description;
  return obj;
}

function eventsPage(events, routeById) {
  const upcoming = events.filter((e) => e.status !== "past").sort((a, b) => String(a.date_iso).localeCompare(String(b.date_iso)));
  const past = events.filter((e) => e.status === "past").sort((a, b) => String(b.date_iso).localeCompare(String(a.date_iso)));
  const crumbItems = [
    { name: "Bush Map", url: "/" },
    { name: "Bush Events", url: "/events/" },
  ];
  const ld_ = ld([breadcrumbLd(crumbItems)].concat(upcoming.map((e) => eventLd(e, routeById))));

  const section = (title, list) =>
    list.length ? `<h2>${esc(title)}</h2><div class="ev-list">${list.map((e) => eventCard(e, routeById)).join("\n")}</div>` : "";
  const bodyInner = upcoming.length || past.length
    ? section("Upcoming rides", upcoming) + section("Past rides", past)
    : `<p class="rp-empty">No rides on the calendar right now — check back soon, or <a href="/">watch the map</a>.</p>`;

  const body = `
${crumbs(crumbItems)}
<h1 class="rp-title">Bush Events</h1>
<p class="rp-intro">${esc(EVENTS_INTRO)}</p>
${bodyInner}`;
  return head({
    title: "Community Bush Rides — Gravel Events | Bush Map",
    description: clampDesc("Upcoming community gravel rides across Queensland with Bush Map — social pace, no one gets dropped. See the route and come along."),
    path: "/events/",
    jsonld: ld_,
  }) + body + foot();
}

/* ---------------- page CSS (inline; uses app.css tokens) ---------------- */
const PAGE_CSS = `
/* app.css locks the map app to a non-scrolling viewport (html,body{height:100%;
   overflow:clip}). These are ordinary content pages — undo that so they scroll. */
html,body{height:auto;min-height:100%;overflow:visible;overflow-x:hidden}
.seo-page{background:var(--cream);color:var(--ink);font-family:var(--ui-font);margin:0;min-height:100vh;display:flex;flex-direction:column}
.site-head{display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px 22px;border-bottom:1px solid rgba(0,0,0,.08);background:var(--cream-panel);text-align:center}
.site-brand{font-family:var(--head-font);font-size:26px;color:var(--ink);text-decoration:none}
.site-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
.site-nav a{font-family:var(--ui-font);font-size:13px;font-weight:600;padding:7px 15px;border-radius:999px;border:1px solid rgba(0,0,0,.12);background:var(--cream);color:var(--ink);text-decoration:none;line-height:1}
.site-nav a:hover{border-color:var(--olive);color:var(--olive)}
.wrap{width:100%;max-width:760px;margin:0 auto;padding:22px;flex:1}
.crumbs{font-size:12.5px;color:var(--ink-soft);margin:0 0 14px;display:flex;flex-wrap:wrap;gap:7px;align-items:center}
.crumbs a{color:var(--ink-soft);text-decoration:none}
.crumbs a:hover{color:var(--olive);text-decoration:underline}
.crumbs__sep{opacity:.5}
.rp-title{font-family:var(--head-font);font-weight:400;font-size:38px;line-height:1.05;margin:6px 0 4px;color:var(--ink)}
.rp-loc{margin:0 0 4px;color:var(--ink-soft);font-size:15px}
.rp-hero{margin:0 0 18px;border-radius:14px;overflow:hidden;background:var(--sage)}
.rp-hero__img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}
.rp-hero__img--empty{aspect-ratio:16/9;background:linear-gradient(135deg,var(--sage),var(--olive))}
.rp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(0,0,0,.08);border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden;margin:16px 0}
.rp-stat{background:var(--cream-panel);padding:12px 10px;text-align:center;min-width:0}
.rp-stat__v{display:block;font-family:var(--head-font);font-size:20px;color:var(--ink)}
.rp-stat__l{display:block;margin-top:3px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);font-weight:700}
.rp-actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.rp-actions .button{text-decoration:none}
.rp-start{font-size:14.5px;color:var(--ink-soft);margin:10px 0}
.wrap h2{font-family:var(--head-font);font-weight:400;font-size:26px;margin:26px 0 8px}
.rp-desc{font-size:16px;line-height:1.6;color:var(--ink)}
.rp-map{position:relative;margin:18px 0;border:1px solid rgba(0,0,0,.1);border-radius:12px;overflow:hidden;background:#ece4d2}
.rp-map__live{width:100%;height:380px}
.rp-map__shape{position:absolute;top:0;left:0;right:0;height:380px;background:#ece4d2;display:flex}
.rp-map.is-live .rp-map__shape{display:none}
.rp-map__svg{display:block;width:100%;height:100%}
.rp-map__cap{position:relative;padding:9px 13px;font-size:12px;color:var(--ink-soft);border-top:1px solid rgba(0,0,0,.07);background:var(--cream-panel)}
@media(max-width:560px){.rp-map__live,.rp-map__shape{height:300px}}
.rp-elev{margin:14px 0;padding:12px 14px;background:var(--cream-panel);border:1px solid rgba(0,0,0,.08);border-radius:12px}
.rp-elev__head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.rp-mini{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-soft);font-weight:700}
.rp-elev__note{font-size:12.5px;color:var(--ink-soft);white-space:nowrap}
.rp-elev__svg{display:block;width:100%;height:132px;margin-top:6px}
.rp-meta{font-size:13px;color:var(--ink-soft)}
.rp-meta a{color:var(--olive)}
.rp-faq__item{border-top:1px solid rgba(0,0,0,.1);padding:10px 0}
.rp-faq__item summary{cursor:pointer;font-weight:600;font-size:15.5px}
.rp-faq__item p{margin:8px 0 2px;color:var(--ink-soft);line-height:1.55;font-size:14.5px}
.rp-back{margin:24px 0 0}
.rp-back a{color:var(--olive);font-weight:600;text-decoration:none}
.rp-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:6px 0 4px}
.rp-gallery__item{display:block;border-radius:10px;overflow:hidden;background:var(--sage)}
.rp-gallery__item img{display:block;width:100%;height:150px;object-fit:cover}
.rp-rating{margin:4px 0 12px;font-size:15px;color:var(--ink-soft)}
.rp-rating__stars{color:#d98a3d;letter-spacing:1px}
.rp-reviews{display:flex;flex-direction:column;gap:14px}
.rp-review{border-top:1px solid rgba(0,0,0,.1);padding-top:12px}
.rp-review__head{margin:0}
.rp-review__stars{color:#d98a3d;letter-spacing:.5px;font-size:13px}
.rp-review__text{margin:6px 0 0;color:var(--ink-soft);line-height:1.5;font-size:14.5px}
.rp-intro{font-size:16px;line-height:1.6;color:var(--ink-soft);max-width:60ch;margin:0 0 22px}
.rp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.rp-card{display:flex;flex-direction:column;background:var(--cream-panel);border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden;text-decoration:none;color:inherit}
.rp-card:hover{border-color:var(--olive)}
.rp-card__hero{display:block;width:100%;height:130px;object-fit:cover;background:var(--sage)}
.rp-card__hero--empty{height:130px;background:linear-gradient(135deg,var(--sage),var(--olive))}
.rp-card__body{padding:12px 13px}
.rp-card__name{font-family:var(--head-font);font-weight:400;font-size:19px;margin:0 0 3px;color:var(--ink)}
.rp-card__loc{margin:0 0 6px;font-size:12.5px;color:var(--ink-soft)}
.rp-card__stats{margin:0;font-size:12.5px;color:var(--olive);font-weight:600}
.rp-empty{color:var(--ink-soft)}
.rp-noresult{color:var(--ink-soft);margin:8px 0}
/* Pill filter (all-routes index) */
.rp-filter{margin:0 0 20px;display:flex;flex-direction:column;gap:10px}
.rp-pills{display:flex;flex-wrap:wrap;gap:8px}
.rp-pills--region{padding-top:2px}
.rp-pill{font-family:var(--ui-font);font-size:13px;font-weight:600;padding:7px 14px;border-radius:999px;border:1px solid rgba(0,0,0,.14);background:var(--cream-panel);color:var(--ink);cursor:pointer;line-height:1}
.rp-pill:hover{border-color:var(--olive)}
.rp-pill.is-active{background:var(--olive);border-color:var(--olive);color:#fff}
.rp-pills--region .rp-pill{font-weight:500;font-size:12.5px;padding:6px 12px;color:var(--ink-soft)}
.rp-pills--region .rp-pill.is-active{color:#fff}
/* Events directory */
.ev-list{display:flex;flex-direction:column;gap:14px;margin-bottom:8px}
.ev-card{background:var(--cream-panel);border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:16px 18px}
.ev-card.is-past{opacity:.7}
.ev-card__when{margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--card-rust,#b04a24)}
.ev-card__name{font-family:var(--head-font);font-weight:400;font-size:23px;margin:0 0 6px;color:var(--ink)}
.ev-card__desc{margin:0 0 10px;font-size:14.5px;line-height:1.5;color:var(--ink-soft)}
.ev-card__meta{display:flex;flex-direction:column;gap:4px;font-size:13.5px;color:var(--ink-soft)}
.ev-card__row strong{color:var(--ink);font-weight:600}
.ev-card__meta a{color:var(--olive);text-decoration:none}
.ev-card__actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.ev-card__actions .button{text-decoration:none}
.site-foot{margin-top:30px;padding:22px;border-top:1px solid rgba(0,0,0,.08);background:var(--cream-panel);font-size:12.5px;color:var(--ink-soft);text-align:center}
.site-foot a{color:var(--olive);text-decoration:none}
@media(max-width:560px){.rp-title{font-size:30px}.rp-stats{grid-template-columns:repeat(2,1fr)}}
`;

/* ---------------- write ---------------- */
function writePage(relPath, html) {
  const full = path.join(MAP_DIR, relPath);
  ensureDir(path.dirname(full));
  fs.writeFileSync(full, html);
  return relPath;
}

async function main() {
  console.log("Bush Map — generating static route pages…");
  const features = await loadFeatures();
  const routes = features.map(normalize).filter((r) => r.id && r.name);

  // Safety: if the live routes couldn't be fetched (we fell back) AND that left
  // us with nothing, DON'T wipe the committed pages — a transient API failure at
  // build time must never blank out /routes/**. Bail, keeping what's there.
  if (usedErrorFallback && routes.length === 0) {
    console.warn("! No routes and the live fetch failed — leaving existing pages untouched.");
    return;
  }

  // Clean previous output so deleted routes don't leave stale pages.
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true, force: true });

  const written = [];
  const routeById = new Map(routes.map((r) => [r.id, r]));

  // Individual route pages.
  for (const r of routes) {
    const [reviews, gpx] = await Promise.all([loadReviews(r.id), loadGpx(r)]);
    written.push(writePage(`routes/${r.stateSlug}/${r.regionSlug}/${r.id}/index.html`, routePage(r, reviews, gpx)));
  }

  // /events/ — community rides directory (independent of routes).
  const events = await loadEvents();
  written.push(writePage("events/index.html", eventsPage(events, routeById)));

  // /routes/ — all routes.
  written.push(
    writePage("routes/index.html",
      aggregatePage({
        title: "Curated Gravel Routes Across Australia | Bush Map",
        description: clampDesc("Browse community-vetted gravel cycling routes across Australia — GPX downloads, elevation and surface notes for every ride."),
        path: "/routes/",
        h1: "Gravel Routes",
        intro: ALL_INTRO,
        routes: [...routes].sort((a, b) => a.name.localeCompare(b.name)),
        crumbItems: [{ name: "Bush Map", url: "/" }, { name: "Routes", url: "/routes/" }],
        filter: true,
      }))
  );

  // Per-state and per-region aggregation pages (data-driven).
  const byState = groupBy(routes, (r) => r.stateSlug);
  for (const [stateSlug, stateRoutes] of byState) {
    const sample = stateRoutes[0];
    written.push(
      writePage(`routes/${stateSlug}/index.html`,
        aggregatePage({
          title: `Gravel Routes in ${sample.stateFull} | Bush Map`,
          description: clampDesc(`Community-vetted gravel cycling routes in ${sample.stateFull} — GPX downloads, elevation and surface notes for every ride.`),
          path: `/routes/${stateSlug}/`,
          h1: `Gravel Routes in ${sample.stateFull}`,
          intro: stateIntro(sample.stateFull),
          routes: [...stateRoutes].sort((a, b) => a.name.localeCompare(b.name)),
          crumbItems: [
            { name: "Bush Map", url: "/" },
            { name: "Routes", url: "/routes/" },
            { name: sample.stateFull, url: `/routes/${stateSlug}/` },
          ],
        }))
    );

    const byRegion = groupBy(stateRoutes, (r) => r.regionSlug);
    for (const [regionSlug, regionRoutes] of byRegion) {
      const rs = regionRoutes[0];
      const sorted = [...regionRoutes].sort((a, b) => a.distance - b.distance); // shortest first
      written.push(
        writePage(`routes/${stateSlug}/${regionSlug}/index.html`,
          aggregatePage({
            title: `Gravel Routes in ${rs.regionLabel}, ${rs.stateFull} | Bush Map`,
            description: clampDesc(`Gravel cycling routes in ${rs.regionLabel}, ${rs.stateFull} — GPX downloads, elevation and surface notes, sorted by distance.`),
            path: `/routes/${stateSlug}/${regionSlug}/`,
            h1: `Gravel Routes in ${rs.regionLabel}`,
            intro: regionIntro(rs.regionLabel, rs.stateFull),
            routes: sorted,
            crumbItems: [
              { name: "Bush Map", url: "/" },
              { name: "Routes", url: "/routes/" },
              { name: rs.stateFull, url: `/routes/${stateSlug}/` },
              { name: rs.regionLabel, url: `/routes/${stateSlug}/${regionSlug}/` },
            ],
            extraLd: [itemListLd(sorted, `/routes/${stateSlug}/${regionSlug}/`)],
          }))
      );
    }
  }

  console.log(`✓ wrote ${written.length} page(s):`);
  for (const w of written) console.log("   " + w);
  if (!routes.length) {
    console.log("\n! 0 published routes — only aggregation index pages were written.");
    console.log("  In production the generator fetches the live API; here set BRM_ROUTES_FILE to a routes GeoJSON to preview.");
  }
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

main().catch((e) => {
  console.error("Generation failed:", e);
  process.exit(1);
});
