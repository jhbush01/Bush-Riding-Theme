/**
 * Bush Map — raster icons from the master favicon.
 *
 * map/favicon.svg is the single source of truth for the mark. This regenerates
 * the raster sizes that can't be SVG:
 *
 *   map/public/apple-touch-icon.png   180x180, iOS home screen
 *   map/public/icon-512.png           512x512, upload target for the Shopify
 *                                     theme favicon (Online Store -> Customize
 *                                     -> Theme settings -> Favicon)
 *
 * Both are drawn with SQUARE corners, not the rounded ones in favicon.svg.
 * iOS applies its own squircle mask; handing it a pre-rounded PNG leaves
 * transparent corners that composite against black. Same reasoning for the
 * Shopify upload, which gets scaled and masked by whatever surface shows it.
 *
 * Run: node scripts/build-icons.js   (needs Playwright; not part of any build,
 * so run it by hand whenever the mark changes.)
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "map", "favicon.svg");
const OUT = path.join(ROOT, "map", "public");
const SIZES = [
  { file: "apple-touch-icon.png", size: 180 },
  { file: "icon-512.png", size: 512 },
];

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (_) {
    console.error("Playwright is not installed here. `npm i -D playwright`, then re-run.");
    process.exit(1);
  }

  // Strip the corner radius: these rasters must be full-bleed squares.
  const svg = fs.readFileSync(SRC, "utf8").replace(/(<rect width="64" height="64")\s+rx="[\d.]+"/, "$1");
  if (svg.includes('rx="')) console.warn("Warning: a corner radius survived the strip — check favicon.svg.");
  const uri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

  // PLAYWRIGHT_CHROMIUM_PATH lets a sandbox point at a browser it already has,
  // instead of Playwright downloading its own. Unset everywhere else.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  for (const { file, size } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:#e9e2d0}img{display:block}</style>` +
      `<img src="${uri}" width="${size}" height="${size}">`
    );
    await page.waitForTimeout(120);
    // No omitBackground: these must be opaque.
    await page.screenshot({ path: path.join(OUT, file) });
    await page.close();
    console.log(`  ${file}  ${size}x${size}`);
  }
  await browser.close();
})();
