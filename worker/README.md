# Bush Riding Map — community routes Worker

A small Cloudflare Worker that accepts community **GPX route submissions**, stores
them, and serves **approved** routes to the public map. Separate from the static
Pages site so auth/private data never touches the fast public map.

- `POST /submit` — public. Accepts a GPX + details, autocomputes distance /
  elevation / line, stores it as `pending`.
- `GET /routes` — public. Approved routes as GeoJSON (the map merges these in).
- `GET /file/<key>` — public. Serves a stored GPX/photo from R2.
- `GET /admin` — **Basic-auth** moderation page (approve / reject / delete).
- `POST /admin/action` — Basic-auth. Status changes.

Stack: Worker + **D1** (metadata) + **R2** (GPX & photo files). No framework, no
dependencies in the Worker itself.

## One-time setup

```sh
cd worker
npm install

# 1. Create the database, then paste the printed database_id into wrangler.jsonc
wrangler d1 create bush-riding-map

# 2. Create the file bucket
wrangler r2 bucket create bush-riding-map-routes

# 3. Create the table (remote)
npm run db:init

# 4. Set the admin password (you'll be prompted)
wrangler secret put ADMIN_TOKEN

# 5. Deploy
npm run deploy
```

Then map a custom domain to the Worker (Cloudflare dashboard → your Worker →
Settings → Domains & Routes → add `map-api.bushriding.cc`) and make sure
`wrangler.jsonc` `vars` are right:

- `PUBLIC_URL` = the Worker's public URL (e.g. `https://map-api.bushriding.cc`) —
  used to build `gpx_url` / `photo_url`.
- `ALLOWED_ORIGINS` = comma-separated origins allowed to call it from the browser
  (the Pages site): `https://map.bushriding.cc,https://map.bushriding.cc`.

Finally, point the front-end at it: set `communityApi` in **`map/map.html`** and
**`map/submit.html`** to the Worker URL, commit, and let Pages redeploy.

## Moderation

Visit `https://map-api.bushriding.cc/admin`. The browser prompts for a username
(`admin`) and password (your `ADMIN_TOKEN`). You'll see each submission with a
shape preview; Approve to publish it to the map, Reject to hide, Delete to remove
it and its files.

## Local development

```sh
cd worker
printf 'ADMIN_TOKEN=devpass\nALLOWED_ORIGINS=*\nPUBLIC_URL=http://localhost:8787\n' > .dev.vars
npm run db:init:local
npm run dev          # http://localhost:8787
```

`.dev.vars`, `node_modules/`, and `.wrangler/` are git-ignored.

## Notes / limits

- Validation: GPX required & parsed (≤ 5 MB), email required, difficulty must be
  `easy|moderate|hard`, optional photo ≤ 6 MB. Submitter email is **never** exposed
  in `/routes` — only a first-name "vetted by".
- Photos are stored as-uploaded (capped). If volume grows, move to Cloudflare
  Images for automatic resizing.
- **Region** is submitter-entered (turning coordinates into a place name needs a
  paid geocoder — out of scope for v1).
- Free-tier friendly: D1, R2 and Workers all sit comfortably in the free limits at
  this scale.
