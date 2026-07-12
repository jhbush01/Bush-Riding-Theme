# ALP1NE™ — single-page design study

Static one-page site recreating the design shown in `reference-frames/` (keyframes from a screen recording). Plain HTML + CSS + vanilla JS — no build step, no frameworks.

This site lives in the `map/` folder (matching the Cloudflare Pages output directory).

## Run locally

Open `index.html` directly, or serve the folder:

```
npx http-server map
```

## Deploy to Cloudflare Pages

- Framework preset: **None**
- Build command: *(leave empty)*
- Build output directory: `map`

## Notes

- Frames `f_04`, `f_07`, `f_10`, `f_13` were provided and drive the manifesto, collection, statement and refrain sections. **`f_01` (hero) and `f_16` (footer) were not provided** — those two sections are interpreted from the written brief and should be re-checked against the missing frames.
- Every image is a styled SVG placeholder with a `data-asset-note` attribute describing the final photo/cutout to swap in. No third-party logos are reproduced.
- The header clock is live, pinned to US Pacific time, formatted as in the frames.
- The newsletter form confirms inline without a network call (static site); wire it to a real endpoint later.
