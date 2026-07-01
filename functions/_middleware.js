// Cache policy for the whole Pages site.
//
// The app is a no-build static site, so its filenames aren't fingerprinted.
// This middleware runs on every request and forces the app shell (HTML, JS,
// CSS and data) to revalidate, so a new deploy — or an admin change to the
// events/routes data — shows up on a normal browser refresh with no "clear
// cache" needed. Media (images, GPX) keeps its default caching.
//
// `no-cache` does NOT mean "don't store": the browser keeps its copy and sends
// a conditional request; unchanged files come back as a cheap 304, changed
// files download fresh. This belt-and-suspenders sits alongside _headers so the
// behaviour holds even if _headers isn't applied for some reason.
export async function onRequest(context) {
  const response = await context.next();
  try {
    const path = new URL(context.request.url).pathname;
    const revalidate =
      path === "/" ||
      /\.(?:html|js|mjs|css|json|geojson|svg)$/i.test(path) ||
      !/\.[a-z0-9]+$/i.test(path); // extensionless clean URLs, e.g. /map, /submit
    if (revalidate) {
      const res = new Response(response.body, response);
      res.headers.set("Cache-Control", "no-cache");
      return res;
    }
  } catch (_) {
    /* on any error, fall through to the original response untouched */
  }
  return response;
}
