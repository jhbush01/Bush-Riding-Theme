/**
 * Bush Riding Map — static route page generator (SEO Phase 1).
 *
 * Reads the published community routes and emits one crawlable, JS-free HTML
 * page per route under map/routes/{state}/{region}/{id}/, plus aggregation
 * pages at /routes/, /routes/{state}/ and /routes/{state}/{region}/.
 *
 * Data source (single source of truth = the live community API, so current and
 * future routes are structured identically):
 *   1. BRM_ROUTES_FILE env  → read that local GeoJSON/JSON file (used for tests)
 *   2. else fetch BRM_ROUTES_API (default https://api.bushridingmap.com/routes)
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
const SITE = (process.env.BRM_SITE || "https://bushridingmap.com").replace(/\/$/, "");
const ROUTES_API = process.env.BRM_ROUTES_API || "https://api.bushridingmap.com/routes";
const ROUTES_FILE = process.env.BRM_ROUTES_FILE || "";
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
  <a class="site-brand" href="/">Bush Riding Map</a>
  <nav class="site-nav">
    <a href="/routes/">Routes</a>
    <a href="/">Map</a>
    <a href="/submit">Submit a route</a>
  </nav>
</header>`;
}
function siteFooter() {
  return `<footer class="site-foot">
  <p>Bush Riding Map — community-vetted gravel routes across Australia. Routes are guides only; ride to conditions.</p>
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
  return `<a class="rp-card" href="${esc(routePath(r))}">
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

/* ---------------- individual route page ---------------- */
function routePage(r, reviews) {
  reviews = reviews || { count: 0, average: 0, reviews: [] };
  const revs = reviews.reviews || [];
  const photos = revs.filter((v) => v.photo_url);
  const url = routePath(r);
  const dist = fmt(r.distance), elev = fmt(r.elevation);
  const locLine = [r.regionLabel, r.stateFull].filter(Boolean).join(", ");
  const title = `${r.name} — ${dist}km Gravel Ride near ${r.regionLabel} | Bush Riding Map`;
  const description = clampDesc(
    `${r.name} is a ${dist}km gravel route near ${r.regionLabel}, ${r.stateFull} with ${elev}m of climbing (${r.effort || "gravel"}, ${r.terrain || "gravel"}). Download the GPX and ride it.`
  );

  const crumbItems = [
    { name: "Bush Riding Map", url: "/" },
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

  const navHref = r.lat != null && r.lng != null ? `geo:${r.lat},${r.lng}` : "";

  const stat = (v, label) => `<div class="rp-stat"><span class="rp-stat__v">${esc(v)}</span><span class="rp-stat__l">${esc(label)}</span></div>`;

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

  <div class="rp-actions">
    <a class="button button--primary" href="${esc(r.gpx)}" download>Download GPX</a>
    ${navHref ? `<a class="button" href="${esc(navHref)}">Navigate to start</a>` : ""}
    <a class="button" href="/map#${esc(r.id)}">Open in interactive map</a>
  </div>

  <p class="rp-start"><strong>Start:</strong> ${esc(r.regionLabel)}${r.startNote ? " — " + esc(r.startNote) : ""}.</p>

  <h2>About this route</h2>
  ${r.description ? `<p class="rp-desc">${esc(r.description)}</p>` : `<p class="rp-desc">${esc(r.name)} is a ${dist} km gravel route near ${esc(r.regionLabel)}, ${esc(r.stateFull)}, with ${elev} m of climbing. Open the interactive map for the full turn-by-turn track, or download the GPX to load onto your head unit.</p>`}

  <!-- Static route map: generating this requires a headless browser / tile API,
       which is out of scope for this pure-Node build (see spec). Placeholder. -->
  <div class="rp-map-todo" data-route-id="${esc(r.id)}">
    <span>Route map preview</span>
    <small>TODO: static map image of the route bounding box</small>
  </div>

  <p class="rp-meta">${r.contributor ? `Vetted by ${r.contributorUrl ? `<a href="${esc(r.contributorUrl)}" rel="nofollow noopener">${esc(r.contributor)}</a>` : esc(r.contributor)}` : "Community-contributed route"}.</p>

  ${galleryHtml}

  ${reviewsHtml}

  <h2>Frequently asked questions</h2>
  <div class="rp-faq">
    ${faqs.map((f) => `<details class="rp-faq__item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n    ")}
  </div>

  <p class="rp-back"><a href="/map#${esc(r.id)}">See ${esc(r.name)} on the full interactive map →</a></p>
</article>`;

  return head({ title, description, path: url, image: r.hero || "/public/og-card.jpg", jsonld: ld(jsonld) }) + body + foot();
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
  "Bush Riding Map is a community-vetted collection of gravel-cycling routes across Australia. Every route is ridden and checked before it goes on the map, with a downloadable GPX, elevation and surface notes. Find your next dirt adventure below.";

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
  // opts: {title, description, path, h1, intro, routes, crumbItems, extraLd}
  const jsonld = ld([breadcrumbLd(opts.crumbItems)].concat(opts.extraLd || []));
  const cards = opts.routes.length
    ? `<div class="rp-cards">${opts.routes.map(routeCard).join("\n")}</div>`
    : `<p class="rp-empty">No published routes here yet — <a href="/submit">submit one</a>.</p>`;
  const body = `
${crumbs(opts.crumbItems)}
<h1 class="rp-title">${esc(opts.h1)}</h1>
<p class="rp-intro">${esc(opts.intro)}</p>
${cards}`;
  return head({ title: opts.title, description: opts.description, path: opts.path, jsonld }) + body + foot();
}

/* ---------------- page CSS (inline; uses app.css tokens) ---------------- */
const PAGE_CSS = `
.seo-page{background:var(--cream);color:var(--ink);font-family:var(--ui-font);margin:0;min-height:100vh;display:flex;flex-direction:column}
.site-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:14px 22px;border-bottom:1px solid rgba(0,0,0,.08);background:var(--cream-panel)}
.site-brand{font-family:var(--head-font);font-size:24px;color:var(--ink);text-decoration:none}
.site-nav a{color:var(--ink-soft);text-decoration:none;font-size:14px;font-weight:600;margin-left:16px}
.site-nav a:hover{color:var(--olive)}
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
.rp-map-todo{margin:18px 0;border:1.5px dashed var(--sage);border-radius:12px;background:var(--cream-panel);min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--ink-soft);text-align:center}
.rp-map-todo small{opacity:.7}
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
  console.log("Bush Riding Map — generating static route pages…");
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

  // Individual route pages.
  for (const r of routes) {
    const reviews = await loadReviews(r.id);
    written.push(writePage(`routes/${r.stateSlug}/${r.regionSlug}/${r.id}/index.html`, routePage(r, reviews)));
  }

  // /routes/ — all routes.
  written.push(
    writePage("routes/index.html",
      aggregatePage({
        title: "Curated Gravel Routes Across Australia | Bush Riding Map",
        description: clampDesc("Browse community-vetted gravel cycling routes across Australia — GPX downloads, elevation and surface notes for every ride."),
        path: "/routes/",
        h1: "Gravel Routes",
        intro: ALL_INTRO,
        routes: [...routes].sort((a, b) => a.name.localeCompare(b.name)),
        crumbItems: [{ name: "Bush Riding Map", url: "/" }, { name: "Routes", url: "/routes/" }],
      }))
  );

  // Per-state and per-region aggregation pages (data-driven).
  const byState = groupBy(routes, (r) => r.stateSlug);
  for (const [stateSlug, stateRoutes] of byState) {
    const sample = stateRoutes[0];
    written.push(
      writePage(`routes/${stateSlug}/index.html`,
        aggregatePage({
          title: `Gravel Routes in ${sample.stateFull} | Bush Riding Map`,
          description: clampDesc(`Community-vetted gravel cycling routes in ${sample.stateFull} — GPX downloads, elevation and surface notes for every ride.`),
          path: `/routes/${stateSlug}/`,
          h1: `Gravel Routes in ${sample.stateFull}`,
          intro: stateIntro(sample.stateFull),
          routes: [...stateRoutes].sort((a, b) => a.name.localeCompare(b.name)),
          crumbItems: [
            { name: "Bush Riding Map", url: "/" },
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
            title: `Gravel Routes in ${rs.regionLabel}, ${rs.stateFull} | Bush Riding Map`,
            description: clampDesc(`Gravel cycling routes in ${rs.regionLabel}, ${rs.stateFull} — GPX downloads, elevation and surface notes, sorted by distance.`),
            path: `/routes/${stateSlug}/${regionSlug}/`,
            h1: `Gravel Routes in ${rs.regionLabel}`,
            intro: regionIntro(rs.regionLabel, rs.stateFull),
            routes: sorted,
            crumbItems: [
              { name: "Bush Riding Map", url: "/" },
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
