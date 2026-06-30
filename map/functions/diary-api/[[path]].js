// Same-origin proxy to the diary worker.
//
// The browser kept failing cross-origin requests to diary.bushridingmap.com
// ("Load failed" in every browser). This Cloudflare Pages Function serves
// /diary-api/* on bushridingmap.com itself and forwards to the diary worker
// server-side, so the browser never makes a cross-origin request at all — no
// CORS, no preflight, nothing to fail.
export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  const sub = Array.isArray(params.path) ? params.path.join("/") : params.path || "";
  const target = "https://diary.bushridingmap.com/" + sub + url.search;
  // Clone method, headers and body onto the new URL.
  return fetch(new Request(target, request));
}
