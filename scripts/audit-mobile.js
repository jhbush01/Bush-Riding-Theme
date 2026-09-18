/* Mobile audit — run after scripts/render-preview.py.
 *
 *   python3 scripts/render-preview.py /tmp/shots
 *   node scripts/audit-mobile.js /tmp/shots
 *
 * Reports horizontal overflow, tap targets under 44px, and body text under
 * 12px, at 390x844. Needs the harness pages, so it measures the CSS, not
 * Liquid. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] || '/tmp/m';
const WIDTH = 390, HEIGHT = 844;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.html'))) {
    await page.goto('file://' + path.join(DIR, f));
    const r = await page.evaluate((VW) => {
      const out = { overflow: [], small: [], tiny: [], doc: 0 };
      out.doc = document.documentElement.scrollWidth;

      document.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;

        const id = el.tagName.toLowerCase() +
          (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

        // Anything whose right edge is past the viewport, or that is wider than it.
        if (b.right > VW + 1 || b.width > VW + 1) {
          if (cs.position !== 'fixed' || b.width > VW + 1) {
            out.overflow.push({ id, w: Math.round(b.width), right: Math.round(b.right) });
          }
        }

        // Tap targets.
        const tappable = el.matches('a, button, [role="button"], input, select, summary, label[for]');
        if (tappable && (b.height < 44 || b.width < 44)) {
          const txt = (el.textContent || '').trim().slice(0, 28);
          out.small.push({ id, w: Math.round(b.width), h: Math.round(b.height), txt });
        }

        // Body copy smaller than 12px is a squint on a phone.
        const fs_ = parseFloat(cs.fontSize);
        const hasText = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim().length > 3);
        if (hasText && fs_ < 12 && cs.textTransform !== 'uppercase') {
          out.tiny.push({ id, px: +fs_.toFixed(1), txt: (el.textContent || '').trim().slice(0, 30) });
        }
      });

      const dedupe = (a, k) => {
        const seen = new Set();
        return a.filter((x) => { const s = k(x); if (seen.has(s)) return false; seen.add(s); return true; });
      };
      out.overflow = dedupe(out.overflow, (x) => x.id + x.w).slice(0, 12);
      out.small = dedupe(out.small, (x) => x.id + x.txt).slice(0, 12);
      out.tiny = dedupe(out.tiny, (x) => x.id + x.px).slice(0, 8);
      return out;
    }, WIDTH);

    const name = f.replace('.html', '');
    const flag = r.doc > WIDTH ? `  ⚠ DOC SCROLLS TO ${r.doc}px (viewport ${WIDTH})` : '';
    console.log(`\n── ${name}${flag}`);
    if (r.overflow.length) {
      console.log('   overflowing:');
      r.overflow.forEach((o) => console.log(`     ${o.id}  w=${o.w} right=${o.right}`));
    }
    if (r.small.length) {
      console.log('   tap targets under 44px:');
      r.small.forEach((o) => console.log(`     ${o.id}  ${o.w}x${o.h}  "${o.txt}"`));
    }
    if (r.tiny.length) {
      console.log('   text under 12px:');
      r.tiny.forEach((o) => console.log(`     ${o.id}  ${o.px}px  "${o.txt}"`));
    }
    if (!r.overflow.length && !r.small.length && !r.tiny.length && !flag) console.log('   clean');
  }
  await browser.close();
})();
