/**
 * Bush Map — social share card, screenshotted from the live map.
 *
 * Writes map/public/og-card.jpg (1200x630), which is the link preview for
 * map.bushriding.cc, /submit, and every generated route page that has no hero
 * photo of its own. Replacing that one file changes the preview everywhere.
 *
 * It drives the REAL site rather than mocking one: loads the map, waits for
 * tiles, switches to 3D, hides the chrome that reads as clutter at thumbnail
 * size, and captures. So the card always shows the routes that are actually
 * published — it goes stale on its own if nobody re-runs it, which is why
 * .github/workflows/og-card.yml runs it monthly.
 *
 * Needs real network access to the tile hosts. Run it on a machine (or a CI
 * runner) that can reach tiles.openfreemap.org and tiles.mapterhorn.com.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/build-og-card.js
 *
 * Env:
 *   OG_URL                     page to capture (default the live map)
 *   OG_VIEW                    "3d" (default) or "2d"
 *   PLAYWRIGHT_CHROMIUM_PATH   use a browser that's already installed
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "map", "public", "og-card.jpg");

const URL_ = process.env.OG_URL || "https://map.bushriding.cc/";
const VIEW = (process.env.OG_VIEW || "3d").toLowerCase();
// Facebook, LinkedIn, iMessage and WhatsApp all want 1.91:1. Captured at twice
// this and downsampled, so the labels stay crisp without shipping a 2400px file.
const W = 1200;
const H = 630;
const SCALE = 2;
const QUALITY = 0.82;

// Chrome that helps you use the map but reads as clutter in a 400px-wide
// preview. The wordmark stays: this is a share card, it should be branded.
const HIDE = [
  "#sidebar",
  ".map-tools",
  ".maplibregl-ctrl-top-right",
  ".maplibregl-ctrl-bottom-right",
  ".maplibregl-ctrl-bottom-left",
  ".sidebar-toggle",
  "#detail",
  "#stage",
  ".skip-link",
];

(async () => {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (_) {
    console.error("Playwright is not installed. `npm i -D playwright && npx playwright install chromium`.");
    process.exit(1);
  }

  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
  });

  console.log("Loading", URL_);
  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60000 });

  // The basemap has to actually be on screen before this is worth capturing.
  await page.waitForSelector("#map canvas", { timeout: 30000 });
  await settle(page, 4000);

  if (VIEW === "3d") {
    const btn = await page.$("#view-3d");
    if (!btn) {
      console.warn("No #view-3d button found — capturing flat.");
    } else {
      await btn.click();
      // Terrain means a fresh set of DEM tiles and a mesh rebuild; give it room.
      await settle(page, 7000);
    }
  }

  await page.addStyleTag({ content: HIDE.join(",") + "{display:none !important}" });
  await page.waitForTimeout(600);

  const png = await page.screenshot({ type: "png" });

  // Downsample 2x -> 1x in the browser, so the JPEG is supersampled rather than
  // rendered at half the detail. Avoids a native image dependency.
  const jpeg = await page.evaluate(
    async ({ b64, w, h, q }) => {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = "data:image/png;base64," + b64;
      });
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL("image/jpeg", q).split(",")[1];
    },
    { b64: png.toString("base64"), w: W, h: H, q: QUALITY }
  );

  fs.writeFileSync(OUT, Buffer.from(jpeg, "base64"));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`Wrote ${path.relative(ROOT, OUT)} — ${W}x${H}, ${kb} KB`);
  if (kb > 300) console.warn("Over 300 KB; some chat clients skip large previews. Drop QUALITY.");

  await browser.close();
})();

// Wait for the network to go quiet, then a beat more for the last paint.
// Tile loads are bursty, so networkidle alone lands mid-fade.
async function settle(page, ms) {
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
