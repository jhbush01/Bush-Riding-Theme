// Same-origin proxy to the diary worker.
//
// The browser kept failing cross-origin requests to diary.bushriding.cc
// ("Load failed"). This Cloudflare Pages Function serves /diary-api/* on
// map.bushriding.cc itself and forwards to the diary worker server-side, so the
// browser never makes a cross-origin request at all.
export async function onRequest(context) {
  const { request, params, env } = context;
  try {
    const origin = (env && env.DIARY_ORIGIN) || "https://diary.bushriding.cc";
    const url = new URL(request.url);
    const sub = Array.isArray(params.path) ? params.path.join("/") : params.path || "";
    const target = origin.replace(/\/$/, "") + "/" + sub + url.search;

    const headers = new Headers(request.headers);
    headers.delete("host");

    const init = { method: request.method, headers };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer(); // buffer to avoid streaming/duplex issues
    }

    const resp = await fetch(target, init);
    const outHeaders = new Headers(resp.headers);
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: "diary proxy failed: " + (e && e.message) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
