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
// even if the map is busy and past the data budget. `front` puts them first
// but still waits for a quiet map and respects the budget.
export function prefetchTiles(urls, { urgent = false, front = false } = {}) {
  const fresh = urls.filter((u) => !done.has(u) && !mem.has(u));
  if (front && !urgent) {
    const set = new Set(fresh);
    const lead = [];
    const rest = [];
    for (const x of queue) (x.urgent ? lead : set.has(x.u) ? [] : rest).push(x);
    fresh.forEach((u) => queued.add(u));
    queue = lead.concat(fresh.map((u) => ({ u, urgent: false, front: true })), rest);
  } else if (urgent) {
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

// Drop queued background route work (the view changed and the order is
// stale). Urgent and zoom-ahead tiles stay.
export function clearBackgroundQueue() {
  queue = queue.filter((x) => {
    if (x.urgent || x.front) return true;
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
