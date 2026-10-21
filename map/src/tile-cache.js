/* Tile cache + prefetch: so tapping a route lands on a map that's already drawn.

   MapLibre only loads the tiles for the view it is showing. Tap a pin and it
   flies to the route and only THEN asks for that area's map, relief and
   terrain tiles, so you watched them fill in. This module gets them first.

   - Every basemap / relief / imagery tile goes through a small custom
     protocol (brmtile://). The handler answers from memory, then from the
     browser's Cache Storage, and only then from the network, saving what it
     fetched. Cache Storage is used rather than the ordinary HTTP cache because
     it keeps tiles whatever cache headers the tile servers send, and it
     survives to the next visit.
   - map.js works out which tiles each route's zoomed-in view needs and queues
     them here. The queue downloads quietly in the background, a few at a time,
     and pauses whenever the map is loading or moving so it never slows down
     what's on screen. A pin being pressed or hovered jumps the queue.
   - Background downloading has a data budget per visit, smaller on phones,
     a little on 3G, none with Data Saver or on 2G. A route someone actually
     reaches for is always fetched.

   If Cache Storage isn't available (some private modes) the handler simply
   fetches, so the map works exactly as before. */

const PROTOCOL = "brmtile";
const CACHE_NAME = "brm-tiles-v1";
const MAX_ENTRIES = 4000; // oldest dropped past this (a few hundred MB at most)
const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // refetch tiles older than a month
const MEM_MAX_BYTES = (navigator.deviceMemory || 4) <= 2 ? 12e6 : 32e6;
const BACKGROUND_CONCURRENCY = 4;

let lib = null; // maplibregl
let cachePromise = null;
const mem = new Map(); // url -> ArrayBuffer, most recent last
let memBytes = 0;
const inflight = new Map(); // url -> { promise, waiters, controller }

// Background queue: urls in order, plus a set for dedupe.
let queue = [];
const queued = new Set();
const done = new Set(); // already in cache this visit (or failed) — never re-queued
let active = 0;
let backgroundBytes = 0;
let isBusy = () => false;
let pumpTimer = null;

const BUDGET = (() => {
  const c = navigator.connection || {};
  if (c.saveData) return 0;
  const t = c.effectiveType || "4g";
  if (t === "slow-2g" || t === "2g") return 0;
  if (t === "3g") return 12e6;
  const phone = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  return phone ? 60e6 : 150e6;
})();

export function wrapTileUrl(url) {
  return typeof url === "string" ? url.replace(/^https:\/\//, PROTOCOL + "://") : url;
}
const unwrap = (url) => url.replace(PROTOCOL + "://", "https://");

function openCache() {
  if (!cachePromise) {
    cachePromise =
      typeof caches !== "undefined" && window.isSecureContext
        ? caches.open(CACHE_NAME).catch(() => null)
        : Promise.resolve(null);
  }
  return cachePromise;
}

function remember(url, buf) {
  if (mem.has(url)) {
    memBytes -= mem.get(url).byteLength;
    mem.delete(url);
  }
  mem.set(url, buf);
  memBytes += buf.byteLength;
  for (const [k, v] of mem) {
    if (memBytes <= MEM_MAX_BYTES) break;
    mem.delete(k);
    memBytes -= v.byteLength;
  }
}

async function load(url, signal, background) {
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(url);
      const t = hit && +hit.headers.get("x-brm-t");
      if (hit && Date.now() - t < MAX_AGE_MS) return { buf: await hit.arrayBuffer(), net: false };
    } catch (_) {
      /* unreadable entry — fetch it again */
    }
  }
  const res = await fetch(url, { signal, credentials: "omit" });
  // 204 = an empty tile (open sea); MapLibre draws nothing for it.
  if (res.status === 204) return { buf: new ArrayBuffer(0), net: true };
  if (!res.ok) throw new Error(`Tile ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  if (cache) {
    const headers = { "content-type": res.headers.get("content-type") || "application/octet-stream", "x-brm-t": String(Date.now()) };
    cache.put(url, new Response(buf.slice(0), { headers })).catch(() => {});
  }
  if (background) backgroundBytes += buf.byteLength;
  return { buf, net: true };
}

/* One download per URL however many ask for it. MapLibre cancels tiles it no
   longer needs (constantly, mid-flight); the download is only cancelled when
   everyone waiting on it has gone, so a cancelled map request can't kill a
   prefetch of the same tile, or the other way round. */
function getTile(url, signal, background = false) {
  const m = mem.get(url);
  if (m) {
    remember(url, m); // refresh its place
    return Promise.resolve(m);
  }
  let entry = inflight.get(url);
  if (!entry) {
    const controller = new AbortController();
    entry = { waiters: 0, controller, promise: null };
    entry.promise = load(url, controller.signal, background)
      .then(({ buf }) => {
        remember(url, buf);
        return buf;
      })
      .finally(() => {
        if (inflight.get(url) === entry) inflight.delete(url);
      });
    inflight.set(url, entry);
  }
  entry.waiters++;
  if (!signal) return entry.promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      entry.waiters--;
      if (entry.waiters <= 0) {
        // Forget it first, so a request arriving now starts a fresh download
        // instead of joining this cancelled one.
        if (inflight.get(url) === entry) inflight.delete(url);
        entry.controller.abort();
      }
      reject(new Error("AbortError")); // the form MapLibre recognises as a cancel
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    entry.promise.then(
      (b) => {
        signal.removeEventListener("abort", onAbort);
        resolve(b);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      }
    );
  });
}

export function installTileProtocol(maplibregl) {
  lib = maplibregl;
  lib.addProtocol(PROTOCOL, async (params, abortController) => {
    const data = await getTile(unwrap(params.url), abortController && abortController.signal);
    // MapLibre may transfer the buffer to its worker, so hand it a copy and
    // keep ours intact for the next request.
    return { data: data.slice(0) };
  });
  // Trim old entries once, after the page has settled.
  setTimeout(trimCache, 20000);
}

async function trimCache() {
  const cache = await openCache();
  if (!cache) return;
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    const drop = keys.slice(0, keys.length - Math.floor(MAX_ENTRIES * 0.8));
    for (const k of drop) await cache.delete(k);
  } catch (_) {
    /* nothing to do */
  }
}

/* ── Background queue ────────────────────────────────────────────────────── */

// busy(): true while the map is loading or moving — the queue waits then.
export function setBusyCheck(fn) {
  isBusy = fn;
}

// Add tile URLs (plain https). `urgent` puts them first and starts them now,
// even if the map is busy and past the data budget.
export function prefetchTiles(urls, { urgent = false } = {}) {
  const fresh = urls.filter((u) => !done.has(u) && !mem.has(u));
  if (urgent) {
    const set = new Set(fresh);
    queue = queue.filter((x) => !set.has(x.u));
    fresh.forEach((u) => queued.add(u));
    queue = fresh.map((u) => ({ u, urgent: true })).concat(queue);
  } else {
    for (const u of fresh) {
      if (queued.has(u)) continue;
      queued.add(u);
      queue.push({ u, urgent: false });
    }
  }
  pump();
}

// Drop queued background work (e.g. the view changed and the order is stale).
export function clearBackgroundQueue() {
  queue = queue.filter((x) => {
    if (x.urgent) return true;
    queued.delete(x.u);
    return false;
  });
}

export function prefetchStats() {
  return {
    queued: queue.length,
    active,
    backgroundBytes,
    budget: BUDGET,
    done: done.size,
    probes: probeCount,
    probeAvgMs: probeCount ? Math.round(probeTotalMs / probeCount) : 0,
  };
}

function pump() {
  clearTimeout(pumpTimer);
  while (queue.length) {
    const next = queue[0];
    const limit = next.urgent ? BACKGROUND_CONCURRENCY + 2 : BACKGROUND_CONCURRENCY;
    if (active >= limit) return;
    if (!next.urgent) {
      if (backgroundBytes >= BUDGET) return;
      if (isBusy()) {
        pumpTimer = setTimeout(pump, 300);
        return;
      }
    }
    queue.shift();
    queued.delete(next.u);
    if (done.has(next.u)) continue;
    active++;
    getTile(next.u, null, !next.urgent)
      .catch(() => {})
      .finally(() => {
        done.add(next.u);
        active--;
        pump();
      });
  }
}

// Kick the queue when the map goes quiet.
export function resumePrefetch() {
  pump();
}

/* ── Probe: ask MapLibre itself which tiles a view needs ─────────────────────
   Which tiles a 3D view loads depends on MapLibre's own rules — detail
   falling away towards the horizon, relief drawn finer once it's draped on
   terrain, a few coarse tiles for the far terrain — and any estimate of them
   either misses some or downloads several times too many. So a hidden copy of
   the map, with the same style and the same screen size, is pointed at the
   view and asked. Its tile requests go to a protocol that writes each URL
   down and answers at once with an empty tile (a flat one for elevation), so
   it downloads nothing and is ready in a frame or two. Drawn at a quarter
   resolution and never shown. */
const PROBE = "brmprobe";
let probeMap = null;
let probeEl = null;
let probeSink = null;
let probeN = 0;
let probeChain = Promise.resolve();
let probeCount = 0;
let probeTotalMs = 0;
let flatDem = null;
let blankImg = null;

async function solidPng(size, rgb) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = `rgb(${rgb})`;
  g.fillRect(0, 0, size, size);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  return blob.arrayBuffer();
}

function installProbeProtocol() {
  lib.addProtocol(PROBE, async (params) => {
    const m = params.url.match(/^brmprobe:\/\/(vec|dem|img)\/(\d+)\/(.*)$/);
    if (!m) throw new Error("Bad probe URL");
    const [, kind, n, rest] = m;
    if (+n === probeN && probeSink) probeSink.add("https://" + rest);
    if (kind === "vec") return { data: new ArrayBuffer(0) };
    // Terrarium encodes 0 m as rgb(128, 0, 0).
    if (kind === "dem") return { data: (flatDem || (flatDem = await solidPng(512, "128,0,0"))).slice(0) };
    return { data: (blankImg || (blankImg = await solidPng(1, "0,0,0"))).slice(0) };
  });
}

function ensureProbe(mainMap) {
  const box = mainMap.getContainer();
  if (!probeEl) {
    probeEl = document.createElement("div");
    probeEl.setAttribute("aria-hidden", "true");
    probeEl.style.cssText = "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;z-index:-1;";
    document.body.appendChild(probeEl);
  }
  const w = box.clientWidth + "px", h = box.clientHeight + "px";
  const resized = probeEl.style.width !== w || probeEl.style.height !== h;
  probeEl.style.width = w;
  probeEl.style.height = h;
  if (!probeMap) {
    installProbeProtocol();
    probeMap = new lib.Map({
      container: probeEl,
      style: { version: 8, sources: {}, layers: [] },
      interactive: false,
      attributionControl: false,
      pixelRatio: 0.25,
      fadeDuration: 0,
      maxPitch: 85,
    });
  } else if (resized) {
    probeMap.resize();
  }
}

/* Done once the probe has drawn a frame and no new tile has been asked for
   in QUIET_MS: every request arrives within a few frames of the first draw,
   well before the probe would call itself idle. */
const QUIET_MS = 200;
function requestsSettled(m, cap) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let drawn = false;
    let seen = 0;
    let last = t0;
    const onRender = () => (drawn = true);
    m.on("render", onRender);
    const iv = setInterval(() => {
      const now = performance.now();
      const n = probeSink ? probeSink.size : 0;
      if (n !== seen) {
        seen = n;
        last = now;
      }
      if ((drawn && n > 0 && now - last >= QUIET_MS) || now - t0 >= cap) {
        clearInterval(iv);
        m.off("render", onRender);
        resolve();
      }
    }, 20);
  });
}

/* The https tile URLs MapLibre loads for `cam` ({center, zoom, pitch,
   bearing}) under `style` (the main map's style, route layers removed) with
   `terrain` ({source, exaggeration} or null). One view at a time. */
export function probeTiles(mainMap, style, cam, terrain) {
  const run = async () => {
    const t0 = performance.now();
    ensureProbe(mainMap);
    const n = ++probeN;
    const st = JSON.parse(JSON.stringify(style));
    for (const s of Object.values(st.sources)) {
      if (!Array.isArray(s.tiles)) continue;
      const kind = s.type === "vector" ? "vec" : s.type === "raster-dem" ? "dem" : "img";
      s.tiles = s.tiles.map((t) => `${PROBE}://${kind}/${n}/${t.replace(/^[a-z]+:\/\//, "")}`);
    }
    if (terrain) st.terrain = terrain;
    else delete st.terrain;
    probeSink = new Set();
    // diff:false rebuilds every source, so tiles shared with the last view
    // are asked for again rather than quietly reused.
    probeMap.setStyle(st, { diff: false });
    probeMap.jumpTo({ center: cam.center, zoom: cam.zoom, pitch: cam.pitch || 0, bearing: cam.bearing || 0 });
    await requestsSettled(probeMap, 2500);
    const out = [...probeSink];
    probeSink = null;
    probeCount++;
    probeTotalMs += performance.now() - t0;
    return out;
  };
  const p = probeChain.then(run, run);
  probeChain = p.catch(() => {});
  return p;
}

// Free the hidden map once the queue has nothing left for it.
export function releaseProbe() {
  probeChain = probeChain.then(() => {
    if (probeMap) probeMap.remove();
    probeMap = null;
    if (probeEl) probeEl.remove();
    probeEl = null;
  });
}
