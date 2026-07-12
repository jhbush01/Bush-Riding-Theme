# SEO route page generator

`generate-route-pages.js` produces static, crawlable, JS-free HTML pages for
every **published** route, plus region aggregation pages, so search engines and
AI crawlers can read route content without executing JavaScript.

## Run it

```bash
npm run build:seo
```

Output is written into `map/` under:

```
map/routes/index.html                                  → /routes/
map/routes/{state}/index.html                          → /routes/qld/
map/routes/{state}/{region}/index.html                 → /routes/qld/southern-downs/
map/routes/{state}/{region}/{route-id}/index.html      → /routes/qld/southern-downs/{id}
```

`map/routes/` is git-ignored — it's build output, not source (see below).

## Data source (single source of truth)

The generator resolves routes in this order:

1. `BRM_ROUTES_FILE=/path/to/routes.geojson` — read a local file (used for tests).
2. Otherwise **fetch `BRM_ROUTES_API`** (default `https://map-api.bushriding.cc/routes`) —
   the live published community routes. This keeps current and future routes
   structured identically with no manual step.
3. If the fetch fails, fall back to the committed `map/data/routes.geojson` so a
   deploy never breaks.

Only features with `status: "published"` are generated. Drafts are skipped.

## How pages get created (no Cloudflare setup needed)

The **`Generate route pages` GitHub Action** (`.github/workflows/generate-route-pages.yml`)
runs the generator on GitHub's runners — which can reach the public routes API —
and commits `map/routes/**` to the production branch. Cloudflare Pages then
serves them as ordinary static files. No Pages build command required.

It runs:
- **on every push** to the production branch (so a deploy refreshes all pages),
- **on a schedule** (every 30 min, to pick up newly approved routes),
- **on demand** (Actions tab → Run workflow),
- **on `repository_dispatch`** `routes-changed` (see below).

The commit is made with `GITHUB_TOKEN`, which does not re-trigger workflows, so
there is no loop.

### Instant regeneration on route approval (optional)

To make a newly approved route's page appear within ~a minute (instead of on the
next deploy/schedule), let the community Worker trigger the Action:

1. Create a GitHub token with **contents: write** on this repo (fine-grained
   token scoped to the repo is ideal).
2. On the **community Worker** (map-api.bushriding.cc):
   `wrangler secret put GITHUB_DISPATCH_TOKEN` → paste the token.
   (`GITHUB_REPO` is already set in `wrangler.jsonc`.)

The Worker fires a `repository_dispatch` on approve/edit/remove → the Action
regenerates and commits. Best-effort: if unset, pages still refresh on the next
deploy and on the schedule.

### Alternative: generate at deploy via Cloudflare

If you'd rather not commit the HTML, set the Pages **Build command** to
`npm run build:seo` and **Output dir** to `map` (and delete/disable the Action).
Pair it with a Pages Deploy Hook in `PAGES_DEPLOY_HOOK` for instant rebuilds.

If you'd rather commit the HTML instead of generating at deploy: remove
`map/routes/` from `.gitignore`, run `npm run build:seo` locally (you have API
access), and commit the generated files.
