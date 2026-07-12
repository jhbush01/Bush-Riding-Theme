# Bush Riding Map — ride diary Worker (authenticated)

Personal ride diary API. Separate from the public community worker. Email/password
auth (PBKDF2 hashes, HMAC-SHA256 JWT in an httpOnly cookie), private GPX + photo
storage, per-user data isolation. Worker + D1 + R2, no npm deps in the worker.

Endpoints: `POST /auth/register|login|logout`, `GET /auth/session`,
`GET|POST /rides`, `GET /rides/stats`, `GET|PUT|DELETE /rides/:id`,
`GET /file/:key` (ownership-checked).

## Setup (dashboard parts already done: D1 + R2 created)

```sh
cd diary-worker
npm install
wrangler login          # if using CLI; or use the dashboard Git-connect flow

# database id is already in wrangler.jsonc. Create the tables:
npm run db:init

# session signing secret — a random 32+ char string:
wrangler secret put JWT_SECRET

# deploy (CLI), or connect the repo as a Worker with Root directory = diary-worker
npm run deploy
```

Then add the custom domain **`diary.bushriding.cc`** to the Worker
(Settings → Domains & Routes), and confirm `wrangler.jsonc` vars:
- `PUBLIC_URL` = `https://diary.bushriding.cc`
- `ALLOWED_ORIGINS` = `https://map.bushriding.cc,https://map.bushriding.cc`

Front-end uses it via `BRM_CONFIG.diaryApi` with `credentials: "include"` so the
httpOnly session cookie is sent.

## Auth notes
- Passwords: salted PBKDF2-SHA256 (100k iterations), stored `saltB64:hashB64`.
- Session: JWT (HS256, 30 days) in an `HttpOnly; Secure; SameSite=None` cookie so
  the cross-subdomain credentialed fetch works and JS can't read the token.
- Register/login also return the token in the body for non-browser clients.

## Local dev
```sh
cd diary-worker
printf 'JWT_SECRET=dev-secret-change-me\nALLOWED_ORIGINS=*\nPUBLIC_URL=http://localhost:8788\n' > .dev.vars
npm run db:init:local
npm run dev   # http://localhost:8788
```
