/* Contrast for type sitting ON a photograph.
 *
 *   node scripts/audit-contrast.js
 *
 * The DOM cannot answer this one: the background is an image under a gradient,
 * so walking up the tree for a background-color finds the section's own colour
 * and reports 1:1. This screenshots each element's box, takes the median pixel
 * as the ground behind the text, and measures the real ratio.
 *
 * This is the check that would have caught the About hero shipping a bone
 * headline onto a bright sunset. */
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const path = require('path');

const lum = (c) => { const [r,g,b] = c.map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*r+0.7152*g+0.0722*b; };
const ratio = (a,b) => { const l1=lum(a), l2=lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  for (const [file, w, h] of [['home',1440,900],['home',390,844],['collection',1440,900],['about',1440,900]]) {
    const p = await b.newPage({ viewport:{width:w,height:h} });
    await p.goto('file://' + path.resolve('/tmp/m/' + file + '.html'));
    // Text that sits over media: inside a tile, hero or journal lead.
    const targets = await p.evaluate(() => {
      const sel = '.alp-hero__tagline, .alp-hero__place, .alp-tile__eyebrow, .alp-tile__label, .alp-cat__eyebrow, .alp-cat__title, .alp-journal__eyebrow, .alp-journal__title';
      return [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => {
        const r = e.getBoundingClientRect();
        return { sel: e.tagName.toLowerCase()+'.'+String(e.className).trim().split(/\s+/)[0],
                 txt: e.textContent.trim().slice(0,28), color: getComputedStyle(e).color,
                 x:Math.max(0,Math.round(r.x)), y:Math.max(0,Math.round(r.y)),
                 w:Math.round(r.width), h:Math.round(r.height) };
      });
    });
    console.log(`\n── ${file} @${w}×${h}`);
    if (!targets.length) { console.log('   (no type over media)'); await p.close(); continue; }
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (t.w < 4 || t.h < 4) continue;
      // Scroll it into view and re-measure: a clip outside the viewport fails.
      const box = await p.evaluate((idx) => {
        const sel = '.alp-hero__tagline, .alp-hero__place, .alp-tile__eyebrow, .alp-tile__label, .alp-cat__eyebrow, .alp-cat__title, .alp-journal__eyebrow, .alp-journal__title';
        const el = [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length)[idx];
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }, i);
      if (!box || box.w < 4 || box.h < 4) continue;
      const cx = Math.max(0, box.x), cy = Math.max(0, box.y);
      const cw = Math.min(box.w, w - cx), ch = Math.min(box.h, h - cy);
      if (cw < 4 || ch < 4 || cy >= h || cx >= w) continue;
      const buf = await p.screenshot({ clip:{ x:cx, y:cy, width:cw, height:ch } });
      const png = PNG.sync.read(buf);
      const lums = [];
      for (let i=0;i<png.data.length;i+=4) lums.push([png.data[i],png.data[i+1],png.data[i+2]]);
      lums.sort((a,b2)=>lum(a)-lum(b2));
      const med = lums[Math.floor(lums.length/2)];
      const m = t.color.match(/rgba?\(([^)]+)\)/);
      const fg = m ? m[1].split(',').slice(0,3).map(Number) : [255,255,255];
      const c = ratio(fg, med);
      const flag = c < 4.5 ? (c < 3 ? '  ✗ FAIL' : '  ~ marginal') : '  ok';
      console.log(`   ${c.toFixed(2)}:1${flag}  ${t.sel}  "${t.txt}"`);
    }
    await p.close();
  }
  await b.close();
})();
