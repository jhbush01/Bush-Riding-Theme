// GPX parsing + autocompute. Pure JS — runs in the Workers runtime and in Node
// (for tests). No dependencies.

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

  // Distance (haversine over full resolution).
  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += haversine(pts[i - 1], pts[i]);

  // Elevation gain: smooth then sum positive deltas (raw GPS ele is noisy).
  const eles = pts.map((p) => p.ele).filter((e) => e !== null);
  let gain = 0;
  if (eles.length > 2) {
    const win = 5;
    const smooth = eles.map((_, i) => {
      const s = Math.max(0, i - win);
      const e = Math.min(eles.length, i + win + 1);
      return eles.slice(s, e).reduce((a, b) => a + b, 0) / (e - s);
    });
    for (let i = 1; i < smooth.length; i++) {
      const d = smooth[i] - smooth[i - 1];
      if (d > 0) gain += d;
    }
  }

  // Downsample to ~150 coords for the on-map line (keep first & last).
  const target = 150;
  const step = Math.max(1, Math.floor(pts.length / target));
  const coords = [];
  for (let i = 0; i < pts.length; i += step) coords.push([round(pts[i].lon), round(pts[i].lat)]);
  const last = pts[pts.length - 1];
  if (coords[coords.length - 1][0] !== round(last.lon) || coords[coords.length - 1][1] !== round(last.lat)) {
    coords.push([round(last.lon), round(last.lat)]);
  }

  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);

  return {
    pointCount: pts.length,
    distance_km: Math.round(dist / 1000),
    elevation_gain_m: Math.round(gain / 10) * 10,
    marker: [round(pts[0].lon), round(pts[0].lat)],
    bounds: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map(round),
    coords,
  };
}

function haversine(a, b) {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const la1 = a.lat * toR;
  const la2 = b.lat * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function round(v) {
  return Math.round(v * 1e5) / 1e5;
}
