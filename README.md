# Bush Riding

Everything the Bush Riding world runs on lives in this one repo: the Shopify
storefront theme, the routes map site, and the two Cloudflare Workers behind it.

Read [`CLAUDE.md`](/CLAUDE.md) before making changes — it carries the brand
voice that governs every line of copy in the project, plus the rules that keep
the Shopify theme editor and the deploy pipelines happy.

## What's here

| Path | What it is | Deployed as |
| --- | --- | --- |
| repo root | Shopify theme (Dawn-based, wearing the Bush Riding skin) | the published store theme, synced by Shopify's GitHub integration |
| [`map/`](/map) | Static MapLibre routes map | Cloudflare Pages → **map.bushriding.cc** |
| [`worker/`](/worker) | Community route submissions, moderation, events | Cloudflare Worker → **map-api.bushriding.cc** |
| [`diary-worker/`](/diary-worker) | Accounts + personal ride diary | Cloudflare Worker → **diary.bushriding.cc** |
| [`functions/`](/functions) | Cloudflare Pages Functions (cache policy, `/diary-api` proxy) | with the Pages site |
| [`scripts/`](/scripts) | SEO route-page generator (`npm run build:seo`) | GitHub Actions |

Each of those folders has its own README with the detail.

## Branches

`main` is production. `develop` is integration — day-to-day work lands there
first and is published by merging `develop` → `main`. Use `feature/*` for
experiments. Never force-push a shared branch.

Before editing on a Shopify-connected branch, always `git pull --rebase`: the
Shopify bot commits theme-editor changes back to the branch, and has at least
once pushed a stale copy of an asset over newer code.

## Working on the theme

The theme is built on [Dawn](https://github.com/Shopify/dawn). Use the
[Shopify CLI](https://shopify.dev/docs/themes/tools/cli) for local development
and previews, and [Theme Check](https://github.com/shopify/theme-check) to lint
— CI runs it on every push (`.github/workflows/ci.yml`).

`templates/*.json`, `sections/*-group.json` and `config/settings_data.json` are
shared with the theme editor: treat them as editor-owned. Code-owned files
(`sections/*.liquid`, `assets/*`) can be changed freely.

## Working on the map

```sh
cd map && python3 -m http.server 8080
# open http://localhost:8080
```

No build step — it's plain modules and CSS. See [`map/README.md`](/map/README.md).

## License

The theme is derived from Shopify's Dawn. Copyright (c) 2021-present Shopify
Inc. See [LICENSE](/LICENSE.md) for the terms that carry over.
