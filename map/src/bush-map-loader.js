/* Bush Map™ loading animation — <bush-map-loader>
   Self-contained, no dependencies, transparent background, 4 s seamless loop.
   Usage:
     <script src="bush-map-loader.js"></script>
     <bush-map-loader style="width:320px"></bush-map-loader>
   Attributes (all optional):
     fill      liquid colour            default #4c4b3b (olive)
     ink       outline colour           default #4c4b3b (olive)
     no-label  hide the "BUSH MAP™" text under the scene
   Size it with CSS width; height follows. Remove the element when the map is ready.
   Honours prefers-reduced-motion (shows one still, full frame). */
(function () {
  if (window.customElements && customElements.get('bush-map-loader')) return;
  const C = { bone: '#edecc5', olive: '#4c4b3b', khaki: '#817f57', sage: '#b8bca1' };
  const DUR = 4, SETTLE = 3.2, DRAIN = 3.6;
  const VB = { w: 420, h: 330 }, HZ = 172, VP = 210, BASE = 318, GROUND = 290, TOP = 14;
  const TAU = Math.PI * 2;
  const E = {
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function piecewise(T, xs, ys, ease) {
    if (T <= xs[0]) return ys[0];
    for (let i = 0; i < xs.length - 1; i++) if (T <= xs[i + 1]) return ys[i] + (ys[i + 1] - ys[i]) * ease((T - xs[i]) / (xs[i + 1] - xs[i]));
    return ys[ys.length - 1];
  }

  const RIDERS = [
    { x: 128, s: 0.56, phase: 0, legW: [13, 9], shapes: [
      ['e', 0, -170, 16, 12], ['p', 'M-17 -170 C-14 -184 14 -184 18 -170 L24 -166 L-17 -166 Z'],
      ['p', 'M-12 -160 L13 -160 L0 -138 Z'],
      ['p', 'M-35 -142 C-36 -154 -14 -158 0 -157 C14 -158 34 -154 33 -142 L27 -86 C14 -80 -14 -80 -27 -86 Z'],
      ['p', 'M-33 -138 C-46 -124 -48 -106 -44 -88 L-38 -88 C-40 -104 -38 -120 -26 -130 Z'],
      ['p', 'M33 -138 C46 -124 48 -106 44 -88 L38 -88 C40 -104 38 -120 26 -130 Z'],
      ['e', 0, -22, 8, 34],
      ['p', 'M-40 -64 C-40 -72 -10 -72 -10 -64 L-9 -10 C-18 -5 -32 -5 -41 -10 Z'], ['e', -25, -70, 14, 6],
      ['p', 'M40 -64 C40 -72 10 -72 10 -64 L9 -10 C18 -5 32 -5 41 -10 Z'], ['p', 'M41 -60 L50 -60 L50 -30 L41 -30 Z'],
    ]},
    { x: 292, s: 0.54, phase: 1 / 3, legW: [12, 8], shapes: [
      ['e', 0, -168, 14, 13], ['p', 'M-15 -170 C-14 -186 14 -186 15 -170 Z'], ['p', 'M-16 -172 L-30 -168 L-14 -166 Z'],
      ['p', 'M6 -160 C14 -150 12 -138 4 -130 L0 -134 C6 -142 6 -150 2 -158 Z'],
      ['p', 'M-27 -140 C-30 -152 -12 -155 0 -154 C12 -155 30 -152 27 -140 L22 -86 C12 -80 -12 -80 -22 -86 Z'],
      ['p', 'M-26 -136 C-40 -122 -44 -104 -44 -88 L-38 -88 C-37 -104 -32 -118 -20 -128 Z'],
      ['p', 'M26 -136 C40 -122 44 -104 44 -88 L38 -88 C37 -104 32 -118 20 -128 Z'],
      ['p', 'M-50 -90 L50 -90 L50 -85 L-50 -85 Z'],
      ['e', 0, -22, 5, 34],
      ['p', 'M-14 -76 L14 -76 L8 -40 C4 -36 -4 -36 -8 -40 Z'],
    ]},
    { x: 210, s: 0.6, phase: 2 / 3, legW: [13, 9], shapes: [
      ['e', 0, -168, 15, 13], ['p', 'M-8 -156 L8 -156 L6 -146 L-6 -146 Z'],
      ['p', 'M-31 -140 C-34 -152 -14 -156 0 -155 C14 -156 34 -152 31 -140 L25 -86 C14 -80 -14 -80 -25 -86 Z'],
      ['p', 'M-30 -138 C-42 -120 -44 -100 -40 -84 L-34 -84 C-36 -100 -32 -116 -24 -128 Z'],
      ['p', 'M30 -138 C42 -120 44 -100 40 -84 L34 -84 C36 -100 32 -116 24 -128 Z'],
      ['e', 0, -22, 6, 34],
      ['p', 'M-20 -78 C-20 -82 20 -82 20 -78 L20 -64 C20 -60 -20 -60 -20 -64 Z'],
      ['p', 'M-32 -58 L-9 -58 L-8 -14 L-33 -14 Z'],
      ['p', 'M32 -58 L9 -58 L8 -14 L33 -14 Z'],
    ]},
  ];
  function legs(a, w) {
    const leg = (side, sgn) => {
      const y = -40 + 11 * sgn * Math.sin(a), kx = side * (16 + 3 * sgn * Math.sin(a));
      return `M${side * 22} -88 L${side * 8} -88 L${(kx - side * w[1] / 2).toFixed(1)} ${(y - 22).toFixed(1)} L${(side * 6).toFixed(1)} ${y.toFixed(1)} L${(side * 14).toFixed(1)} ${y.toFixed(1)} L${(kx + side * w[1] / 2).toFixed(1)} ${(y - 26).toFixed(1)} Z`;
    };
    return [leg(-1, 1), leg(1, -1)];
  }

  const rnd = (seed) => { let t = seed; return () => { t = (t * 9301 + 49297) % 233280; return t / 233280; }; };
  function makeGum(seed) {
    const r = rnd(seed), trunk = [], leaves = [], lines = [];
    const f = (v) => v.toFixed(1);
    const limb = (x, y, ang, len, w0, w1, depth) => {
      const bend = (r() - 0.5) * len * 0.35;
      const ex = x + len * Math.sin(ang), ey = y - len * Math.cos(ang);
      const mx = (x + ex) / 2 + bend * Math.cos(ang), my = (y + ey) / 2 + bend * Math.sin(ang);
      const nx = Math.cos(ang), ny = Math.sin(ang);
      trunk.push(['p', `M${f(x - nx * w0)} ${f(y - ny * w0)} Q${f(mx - nx * (w0 + w1) / 2)} ${f(my - ny * (w0 + w1) / 2)} ${f(ex - nx * w1)} ${f(ey - ny * w1)} L${f(ex + nx * w1)} ${f(ey + ny * w1)} Q${f(mx + nx * (w0 + w1) / 2)} ${f(my + ny * (w0 + w1) / 2)} ${f(x + nx * w0)} ${f(y + ny * w0)} Z`]);
      if (depth === 0) {
        for (let i = 0; i < 3; i++) {
          const o = (i - 1) * w0 * 0.5, t0 = 0.15 + r() * 0.2, t1 = t0 + 0.2 + r() * 0.25;
          lines.push(`M${f(x + o + (mx - x) * t0 * 2)} ${f(y + (my - y) * t0 * 2)} Q${f(mx + o * 0.6)} ${f(my)} ${f(x + o * 0.5 + (ex - x) * t1)} ${f(y + (ey - y) * t1)}`);
        }
      }
      if (depth >= 3 || (depth === 2 && r() > 0.6)) {
        const n = 6 + Math.floor(r() * 4), spread = 26 + r() * 18;
        for (let i = 0; i < n; i++) {
          const cx = ex + (r() - 0.5) * spread, cy = ey + 2 + (r() - 0.3) * spread * 0.4 + Math.abs(cx - ex) * 0.18;
          leaves.push(['r', +f(cx), +f(cy), +f(7 + r() * 8), +f(3.5 + r() * 3), +f((cx - ex) * 0.6 + (r() - 0.5) * 20)]);
        }
        lines.push(`M${f(ex - spread * 0.3)} ${f(ey + 6)} q2 7 1 12`, `M${f(ex + spread * 0.25)} ${f(ey + 7)} q-1 6 0 11`);
        return;
      }
      const kids = depth === 0 ? 2 + (r() > 0.5 ? 1 : 0) : 2;
      for (let i = 0; i < kids; i++) {
        const sp = (i / (kids - 1) - 0.5) * (0.9 + r() * 0.5) + (r() - 0.5) * 0.25;
        limb(ex, ey, ang * 0.6 + sp, len * (0.58 + r() * 0.2), w1, w1 * 0.62, depth + 1);
      }
    };
    limb(0, 0, (r() - 0.5) * 0.14, 118 + r() * 30, 9, 5.5, 0);
    limb(1, -52 - r() * 20, 0.75 + r() * 0.2, 46, 3.6, 2.2, 2);
    return { trunk, leaves, lines };
  }
  const GUMS = [makeGum(11), makeGum(97), makeGum(203)];

  // All periodic motion divides 4 s so the loop is seamless
  function treesAt(T) {
    const out = [];
    [-1, 1].forEach((side) => [0, 1, 2].forEach((k) => {
      const p = (T / 2 + k / 3 + (side > 0 ? 1 / 6 : 0)) % 1;
      const e = Math.pow(p, 1.5);
      out.push({ v: (k + (side > 0 ? 1 : 0)) % 3, p, x: VP + side * (50 + 180 * e), y: HZ + 2 + (BASE - 10 - HZ) * e, s: 0.14 + 0.86 * e, flip: -side, op: Math.min(1, p / 0.15, (1 - p) / 0.18) });
    }));
    return out.sort((a, b) => a.p - b.p);
  }
  function dashesAt(T) {
    return [0, 1, 2, 3].map((k) => {
      const p = (T + k / 4) % 1, e = p * p, y = HZ + 4 + (BASE - HZ - 4) * e;
      return `M${VP} ${y.toFixed(1)} L${VP} ${(y + 3 + 16 * e).toFixed(1)}`;
    });
  }
  function birdsAt(T) {
    return [[0, 46, 1], [70, 30, 0.8], [130, 62, 0.9], [300, 40, 0.7]].map(([x0, y0, s], i) => {
      const x = ((x0 + T * (520 / DUR)) % 520) - 50;
      const fl = 6 * s * Math.sin(T * TAU * 2.5 + i * 1.7);
      const y = y0 + 3 * Math.sin((T * TAU) / DUR + i);
      return `M${(x - 11 * s).toFixed(1)} ${(y + fl * 0.6 - 2).toFixed(1)} Q${(x - 5 * s).toFixed(1)} ${(y - fl).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} Q${(x + 5 * s).toFixed(1)} ${(y - fl).toFixed(1)} ${(x + 11 * s).toFixed(1)} ${(y + fl * 0.6 - 2).toFixed(1)}`;
    });
  }
  const ROAD = `M${VP - 10} ${HZ} L${VP + 10} ${HZ} L376 ${BASE} L44 ${BASE} Z`;
  const LAND_LINES = [`M${VP - 10} ${HZ} L44 ${BASE}`, `M${VP + 10} ${HZ} L376 ${BASE}`, `M24 ${BASE + 2} C120 ${BASE - 1} 300 ${BASE + 3} 396 ${BASE}`,
    'M60 300 L56 291 M64 300 L66 289 M68 300 L74 293', 'M352 304 L348 295 M356 304 L358 293', 'M30 260 L27 253 M33 260 L35 251'];

  const A = (o) => Object.keys(o).map((k) => `${k}="${o[k]}"`).join(' ');
  function shape(sh, st) {
    if (sh[0] === 'r') return `<ellipse cx="${sh[1]}" cy="${sh[2]}" rx="${sh[3]}" ry="${sh[4]}" transform="rotate(${sh[5]} ${sh[1]} ${sh[2]})" ${A(st)}/>`;
    if (sh[0] === 'e') return `<ellipse cx="${sh[1]}" cy="${sh[2]}" rx="${sh[3]}" ry="${sh[4]}" ${A(st)}/>`;
    return `<path d="${sh[1]}" ${A(st)}/>`;
  }
  function scene(T, o) {
    const P = o.paint || {}, ink = o.ink, sw = o.sw || 2, leafInk = o.leafInk !== false;
    const st = (fill, k, w) => ({ fill: fill || 'none', stroke: ink || fill || 'none', 'stroke-width': ((w != null ? w : ink ? sw : 1.5) / k).toFixed(3), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
    const ln = (k) => ({ fill: 'none', stroke: ink, 'stroke-width': (sw / k).toFixed(3), 'stroke-linecap': 'round' });
    let s = `<path d="${ROAD}" fill="${P.road || 'none'}"/>`;
    if (ink) s += LAND_LINES.concat(dashesAt(T)).map((d) => `<path d="${d}" ${A(ln(1))}/>`).join('');
    s += birdsAt(T).map((d) => `<path d="${d}" fill="none" stroke="${ink || P.bird}" stroke-width="${ink ? sw : 3}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    treesAt(T).forEach((t) => {
      const g = GUMS[t.v];
      s += `<g opacity="${t.op.toFixed(3)}" transform="translate(${t.x.toFixed(1)} ${t.y.toFixed(1)}) scale(${(t.s * t.flip).toFixed(3)} ${t.s.toFixed(3)})">`;
      s += g.trunk.map((sh) => shape(sh, st(P.trunk, t.s))).join('');
      if (o.paint || leafInk) s += g.leaves.map((sh) => shape(sh, st(P.tree, t.s, ink ? sw * 0.5 : 0.6))).join('');
      if (ink) s += g.lines.map((d) => `<path d="${d}" ${A(ln(t.s * 1.6))}/>`).join('');
      s += '</g>';
    });
    RIDERS.forEach((r) => {
      const a = (T + r.phase) * TAU;
      s += `<g transform="translate(${r.x} ${GROUND}) scale(${r.s}) rotate(${(2.2 * Math.sin(a)).toFixed(2)} 0 -20)">`;
      s += legs(a, r.legW).map((d) => `<path d="${d}" ${A(st(P.rider, r.s))}/>`).join('');
      s += r.shapes.map((sh) => shape(sh, st(P.rider, r.s))).join('');
      s += '</g>';
    });
    return s;
  }
  function surface(level, amp, phase, above) {
    const edge = above ? -120 : VB.h + 10;
    let d = `M-90 ${edge} L-90 ${level}`;
    for (let x = -90; x <= VB.w + 90; x += 6) d += ` L${x} ${(level + amp * Math.sin((x / 90) * TAU + phase) + amp * 0.4 * Math.sin((x / 37) * TAU - phase * 1.7)).toFixed(2)}`;
    return d + ` L${VB.w + 90} ${edge} Z`;
  }

  // One frame at time T (seconds, wraps at 4) as an SVG string with a transparent background
  function frame(T, opts) {
    opts = opts || {};
    T = ((T % DUR) + DUR) % DUR;
    const liquid = opts.fill || C.olive, ink = opts.ink || C.olive, id = opts.uid || 'bml';
    const rise = piecewise(T, [0, 0.8, 1.65, 2.45, SETTLE], [0, 0.22, 0.5, 0.76, 1], E.inOutCubic);
    const fill = T >= DRAIN ? 1 - E.inOutQuart(clamp01((T - DRAIN) / (DUR - DRAIN))) : rise;
    const calm = T >= SETTLE && T < DRAIN ? 1 - 0.7 * E.outCubic(clamp01((T - SETTLE) / (DRAIN - SETTLE))) : 1;
    const level = BASE + 8 - (BASE + 8 - TOP + 16) * fill;
    const wv = 3.5 * calm, ph = (T / 2) * TAU, seed = Math.floor(T / 0.2) % 3;
    const paint = { road: liquid === C.khaki ? C.sage : C.khaki, tree: liquid, trunk: C.khaki, rider: liquid, bird: liquid };
    const rough = [0, 1, 2].map((k) => `<filter id="${id}r${k}" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="${k * 7 + 3}"/><feDisplacementMap in="SourceGraphic" scale="4.5"/></filter>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB.w} ${VB.h}" width="100%" style="display:block;overflow:visible"><defs>${rough}`
      + `<filter id="${id}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0.929  0 0 0 0 0.925  0 0 0 0 0.773  -1.4 0 0 0 0.66" result="sp"/><feComposite in="sp" in2="SourceAlpha" operator="in" result="s2"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s2"/></feMerge></filter>`
      + `<clipPath id="${id}b"><path d="${surface(level, wv, ph, false)}"/></clipPath><clipPath id="${id}a"><path d="${surface(level, wv, ph, true)}"/></clipPath></defs>`
      + `<g filter="url(#${id}r${seed})">`
      + `<g clip-path="url(#${id}b)"><g filter="url(#${id}g)">${scene(T, { paint })}</g></g>`
      + `<g clip-path="url(#${id}a)">${scene(T, { ink, sw: 2 })}</g>`
      + `<g clip-path="url(#${id}b)">${scene(T, { ink: C.bone, sw: 2, leafInk: false })}</g>`
      + `</g></svg>`;
  }

  window.BushMapLoader = { frame, duration: DUR };

  let count = 0;
  class BushMapLoaderEl extends HTMLElement {
    connectedCallback() {
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>:host{display:inline-flex;flex-direction:column;align-items:center;width:320px;max-width:100%;container-type:inline-size;background:transparent;pointer-events:none}`
          + `.art{width:100%}.label{margin-top:9cqw;font-family:var(--font-heading,"Aktiv Grotesk","Helvetica Neue",Arial,sans-serif);font-weight:600;font-size:7cqw;line-height:1;letter-spacing:.14em;text-transform:uppercase;color:var(--bml-label,${C.olive})}`
          + `.label sup{font-size:2cqw;letter-spacing:0;margin-left:.25em}:host([no-label]) .label{display:none}</style>`
          + `<div class="art" role="img" aria-label="Loading Bush Map"></div><div class="label" aria-hidden="true">Bush Map<sup>™</sup></div>`;
        this._art = root.querySelector('.art');
        this._uid = 'bml' + ++count;
      }
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const draw = (T) => { this._art.innerHTML = frame(T, { fill: this.getAttribute('fill'), ink: this.getAttribute('ink'), uid: this._uid }); };
      if (reduce) { draw(3.4); return; }
      // Bush Map change: duty-cycle cap. Each frame rebuilds ~1,700 SVG nodes —
      // ~17 ms on a laptop, ~60 ms on a mid-range phone — on the same main
      // thread the map is trying to start on, and at a flat 30 fps that made
      // the map take ~2.6x longer to load on a phone. After each draw we wait
      // three times as long as it took, so the loader never holds more than
      // about a quarter of the thread: laptops still see the full 30 fps, slow phones
      // see fewer frames, and the map loads at full speed either way. The art
      // itself is untouched.
      const t0 = performance.now(); let last = -1, next = 0;
      const tick = (now) => {
        if (now >= next) {
          const T = ((now - t0) / 1000) % DUR, f = Math.floor(T * 30);
          if (f !== last) {
            last = f;
            const c0 = performance.now();
            draw(T);
            // Pull style + layout into the measured window (they'd run anyway,
            // just later) so the wait reflects the frame's whole cost.
            this._art.getBoundingClientRect();
            next = now + 3 * (performance.now() - c0);
          }
        }
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); }
  }
  customElements.define('bush-map-loader', BushMapLoaderEl);
})();
