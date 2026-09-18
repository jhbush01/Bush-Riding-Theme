/* Desktop audit — run after scripts/render-preview.py.
 *
 *   node scripts/audit-desktop.js /tmp/shots
 *
 * Overflow at 990/1280/1440/1920, WCAG AA contrast, focus visibility, line
 * length, and whether the fixed rail still fits a 700px laptop.
 *
 * Its contrast check reads the DOM, so it CANNOT see through to a photograph:
 * type over an image comes back as a meaningless 1:1. Use audit-contrast.js
 * for those — it samples the rendered pixels. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || '/tmp/m';
const WIDTHS = [990, 1280, 1440, 1920];

const CONTRAST = `(() => {
  const lum = (c) => {
    const [r,g,b] = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  };
  const parse = (s) => {
    const m = s && s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { rgb: p.slice(0,3), a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => fg.rgb.map((c,i) => c*fg.a + bg[i]*(1-fg.a));
  const bgOf = (el) => {
    let n = el;
    let stack = [];
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
      n = n.parentElement;
    }
    let base = [255,255,255];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  };
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const fg = parse(cs.color);
    if (!fg) return;
    const bg = bgOf(el);
    const c = ratio(over(fg, bg), bg);
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (c < need) {
      out.push({
        sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className
          ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''),
        ratio: +c.toFixed(2), need, px: +px.toFixed(1),
        txt: el.textContent.trim().slice(0, 34)
      });
    }
  });
  const seen = new Set();
  return out.filter(o => { const k = o.sel + o.ratio; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 14);
})()`;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.html'));

  // 1 ── overflow across the width range
  console.log('═══ OVERFLOW ACROSS WIDTHS ═══');
  for (const w of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    const bad = [];
    for (const f of files) {
      await page.goto('file://' + path.join(DIR, f));
      const r = await page.evaluate((VW) => {
        const doc = document.documentElement.scrollWidth;
        const wide = [];
        document.querySelectorAll('*').forEach(el => {
          const b = el.getBoundingClientRect();
          if (b.width === 0) return;
          if (b.right > VW + 1) {
            wide.push((el.tagName.toLowerCase() +
              (typeof el.className === 'string' && el.className
                ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : '')) +
              ' right=' + Math.round(b.right));
          }
        });
        return { doc, wide: [...new Set(wide)].slice(0, 5) };
      }, w);
      if (r.doc > w) bad.push(`   ${f.replace('.html','')}: doc=${r.doc}  ${r.wide.join(' | ')}`);
    }
    console.log(`  ${w}px: ${bad.length ? '\n' + bad.join('\n') : 'clean'}`);
    await page.close();
  }

  // 2 ── contrast, focus, measure at 1440
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  console.log('\n═══ CONTRAST (WCAG AA) @1440 ═══');
  for (const f of files) {
    await page.goto('file://' + path.join(DIR, f));
    const fails = await page.evaluate(CONTRAST);
    console.log(`\n── ${f.replace('.html','')}`);
    if (!fails.length) console.log('   passes');
    fails.forEach(o => console.log(`   ${o.ratio}:1 (needs ${o.need})  ${o.px}px  ${o.sel}  "${o.txt}"`));
  }

  console.log('\n═══ FOCUS VISIBILITY @1440 ═══');
  for (const f of files) {
    await page.goto('file://' + path.join(DIR, f));
    const r = await page.evaluate(() => {
      const bad = [];
      const els = [...document.querySelectorAll('a[href], button, input, select')]
        .filter(e => e.getClientRects().length > 0);
      els.forEach(el => {
        el.focus();
        const cs = getComputedStyle(el);
        const noOutline = cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0;
        const noShadow = cs.boxShadow === 'none';
        if (noOutline && noShadow) {
          bad.push(el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className
            ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : ''));
        }
      });
      return { total: els.length, bad: [...new Set(bad)].slice(0, 8) };
    });
    if (r.bad.length) console.log(`   ${f.replace('.html','')}: ${r.bad.length} kinds with no visible focus — ${r.bad.join(', ')}`);
    else console.log(`   ${f.replace('.html','')}: all ${r.total} focusable elements show focus`);
  }

  console.log('\n═══ LINE LENGTH @1920 (ideal 45–85 chars) ═══');
  await page.setViewportSize({ width: 1920, height: 900 });
  for (const f of files) {
    await page.goto('file://' + path.join(DIR, f));
    const r = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('p, li, h1, h2').forEach(el => {
        const t = el.textContent.trim();
        if (t.length < 60) return;
        const cs = getComputedStyle(el);
        const w = el.getBoundingClientRect().width;
        const ch = w / (parseFloat(cs.fontSize) * 0.5);
        if (ch > 90) out.push({ sel: el.tagName.toLowerCase() +
          (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''),
          ch: Math.round(ch), txt: t.slice(0, 30) });
      });
      const seen = new Set();
      return out.filter(o => { if (seen.has(o.sel)) return false; seen.add(o.sel); return true; }).slice(0, 6);
    });
    if (r.length) r.forEach(o => console.log(`   ${f.replace('.html','')}: ${o.ch} chars  ${o.sel}  "${o.txt}"`));
  }

  console.log('\n═══ RAIL ON A SHORT LAPTOP (1440×700) ═══');
  await page.setViewportSize({ width: 1440, height: 700 });
  for (const f of files) {
    await page.goto('file://' + path.join(DIR, f));
    const r = await page.evaluate(() => {
      const rail = document.querySelector('[data-alp-rail]');
      if (!rail) return null;
      return { scrollH: rail.scrollHeight, clientH: rail.clientHeight,
               overflows: rail.scrollHeight > rail.clientHeight + 1 };
    });
    if (r) console.log(`   ${f.replace('.html','')}: content ${r.scrollH}px in ${r.clientH}px ${r.overflows ? '→ SCROLLS' : '→ fits'}`);
  }

  await browser.close();
})();
