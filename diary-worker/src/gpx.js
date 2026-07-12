// GPX parse + autocompute for the diary. String matching only (DOMParser is
// not reliable in Workers). Returns distance, elevation gain, a LineString
// geometry, and recorded_at (first trackpoint time, then metadata time, else null).

export function parseGpx(xml) {
  const pts = [];
  const re =
    /<trkpt[^>]*\blat="([-0-9.]+)"[^>]*\blon="([-0-9.]+)"[^>]*>(?:[\s\S]*?<ele>([-0-9.]+)<\/ele>)?/g;
  let m;
  while ((m = re.exec(xml))) {
    const lat = +m[1];
    const lon = +m[2];
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      pts.push({ lat, lon, ele: m[3] !== undefined ? +m[3] : null });
    }
  }
  if (pts.length < 2) throw new Error("No track points found in GPX");

  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += haversine(pts[i - 1], pts[i]);

  // Elevation gain: smooth then sum positive deltas.
  const eles = pts.map((p) => p.ele).filter((e) => e !== null);
  let gain = 0;
  if (eles.length > 2) {
    const win = 5;
    const smooth = eles.map((_, i) => {
      const s = Math.max(0, i - win);
      const e = Math.min(eles.length, i + win + 1);
      return eles.slice(s, e).reduce((a, b) => a + b, 0) / (e - s);
    });
    for (let i = 1; i < smooth.length; i++) if (smooth[i] - smooth[i - 1] > 0) gain += smooth[i] - smooth[i - 1];
  }

  // Downsample to ~250 points for storage / drawing.
  const target = 250;
  const step = Math.max(1, Math.floor(pts.length / target));
  const coords = [];
  for (let i = 0; i < pts.length; i += step) coords.push([round(pts[i].lon), round(pts[i].lat)]);
  const last = pts[pts.length - 1];
  const lc = coords[coords.length - 1];
  if (lc[0] !== round(last.lon) || lc[1] !== round(last.lat)) coords.push([round(last.lon), round(last.lat)]);

  return {
    distance_km: Math.round(dist / 1000),
    elevation_m: Math.round(gain / 10) * 10,
    recorded_at: extractTime(xml),
    geometry: { type: "LineString", coordinates: coords },
  };
}

// First <time> at/after the first <trkpt>, else the first <time> (metadata), else null.
function extractTime(xml) {
  const trkIdx = xml.indexOf("<trkpt");
  if (trkIdx >= 0) {
    const t = xml.slice(trkIdx).match(/<time>([^<]+)<\/time>/);
    if (t) return normalizeTime(t[1]);
  }
  const meta = xml.match(/<time>([^<]+)<\/time>/);
  return meta ? normalizeTime(meta[1]) : null;
}
function normalizeTime(s) {
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function haversine(a, b) {
  const R = 6371000,
    toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR,
    dLon = (b.lon - a.lon) * toR;
  const la1 = a.lat * toR,
    la2 = b.lat * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function round(v) {
  return Math.round(v * 1e5) / 1e5;
}
