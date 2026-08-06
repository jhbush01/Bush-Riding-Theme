# Vendored third-party

`maplibre-gl.js` / `maplibre-gl.css` — MapLibre GL JS **v5.24.0**, copied
verbatim from the npm package `maplibre-gl@5.24.0` (`dist/`).

Self-hosted rather than loaded from a CDN so that:

- `Content-Security-Policy: script-src 'self'` can stay tight — no third-party
  script origin has to be trusted;
- there is no supply-chain exposure to a CDN serving altered bytes, and no need
  for Subresource Integrity hashes that cannot be verified at build time here;
- it is served same-origin from Cloudflare's edge alongside everything else.

## Updating

    npm pack maplibre-gl@<version>
    tar xzf maplibre-gl-<version>.tgz
    cp package/dist/maplibre-gl.js package/dist/maplibre-gl.css map/vendor/

Then update the version noted above and re-test the map. Nothing else
references the version number.
