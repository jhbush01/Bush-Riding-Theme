// Email gate. Browsing is free; the gate fires only on "Download GPX".
// On submit we POST to Klaviyo's client-side subscriptions flow
// (revision 2024-10-15), then set a session flag and trigger the real
// download. Subsequent downloads in the same session skip the modal.

// --- Config -------------------------------------------------------------
// KLAVIYO_COMPANY_ID is the PUBLIC company id (a.k.a. site id / public API
// key). The /client/* endpoints authenticate with it alone — there is no
// private key in this file, and there must never be one: everything here ships
// to the browser. A private pk_ key belongs in a Worker secret, nowhere else.
//
// KLAVIYO_LIST_ID is the list every GPX download subscribes to:
// "Bush Riding Map" (R3335d).
const KLAVIYO_COMPANY_ID = window.BRM_CONFIG?.klaviyoCompanyId || "REPLACE_COMPANY_ID";
const KLAVIYO_LIST_ID = window.BRM_CONFIG?.klaviyoListId || "REPLACE_LIST_ID";
// ------------------------------------------------------------------------

const SESSION_KEY = "brm_subscribed";
// Primary path: our own Worker, which forwards to Klaviyo server-side. The
// browser calling a.klaviyo.com directly is unreliable — it sits on the common
// tracker blocklists, so uBlock / Brave / a Pi-hole kill the request before it
// leaves the device and the rider just sees "something went wrong".
const WORKER_SUBSCRIBE_URL = `${(window.BRM_CONFIG?.communityApi || "").replace(/\/$/, "")}/subscribe`;
// Fallback only, for the window where the Worker hasn't been redeployed yet.
// Note: no trailing slash before the query — Klaviyo documents it without one.
const KLAVIYO_SUBSCRIBE_URL = `https://a.klaviyo.com/client/subscriptions?company_id=${KLAVIYO_COMPANY_ID}`;

let pendingRoute = null;

async function startDownload(route) {
  // Fetch the GPX and download it via a blob URL. A plain <a download> to a
  // same-origin file URL is ignored on iOS Safari, which then *navigates* to
  // the file and traps the user on a preview screen with no way back to the
  // map. A blob URL goes through the download manager and leaves the app put.
  try {
    const res = await fetch(route.gpx_url);
    if (!res.ok) throw new Error("gpx fetch " + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = route.id + ".gpx";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    // Last resort: open in a new tab so the map isn't replaced.
    window.open(route.gpx_url, "_blank", "noopener");
  }
}

function alreadySubscribed() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markSubscribed() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* private mode — fall back to in-memory only */
  }
}

/* Subscribe via the Worker. Throws with a human-readable reason on failure —
   the caller shows it, so a validation error is never invisible again.

   Returns quietly if the Worker itself can't be reached (not deployed yet, or
   a transient edge error), so the caller can try Klaviyo directly. */
async function subscribeViaWorker(email) {
  const res = await fetch(WORKER_SUBSCRIBE_URL, {
    method: "POST",
    // text/plain keeps this a CORS "simple" request, so the browser never
    // sends a preflight OPTIONS. The body is still JSON and the Worker still
    // parses it as JSON — this is only about not having a second round trip
    // that can fail on its own. Same trick the diary worker uses.
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ email }),
  });
  if (res.ok) return true;

  let detail = "";
  try {
    detail = (await res.json()).error || "";
  } catch (_) {
    /* no JSON body */
  }
  // 404 means this Worker predates the /subscribe endpoint — let the caller
  // fall back rather than telling the rider the list is broken.
  if (res.status === 404) return false;
  throw new Error(detail || `Subscription failed (${res.status})`);
}

async function subscribe(email) {
  try {
    if (await subscribeViaWorker(email)) return;
  } catch (err) {
    // A real answer from our Worker (bad email, Klaviyo rejected it) is the
    // truth — don't paper over it by retrying somewhere else.
    if (!(err instanceof TypeError)) throw err;
    console.warn("Subscribe Worker unreachable, falling back to Klaviyo:", err.message);
  }
  await subscribeDirect(email);
}

async function subscribeDirect(email) {
  const body = {
    data: {
      type: "subscription",
      attributes: {
        // Shows against the profile in Klaviyo as where the consent came from.
        custom_source: "Bush Riding Map — GPX download",
        profile: {
          data: {
            type: "profile",
            attributes: {
              email,
              /* THIS is what actually subscribes them.
                 Without it Klaviyo still accepts the request and still returns
                 202 — it just records a profile with no email marketing
                 consent, so nobody lands on the list and nothing looks broken
                 from the front end. That was the bug: emails were being
                 collected and quietly going nowhere. */
              subscriptions: {
                email: { marketing: { consent: "SUBSCRIBED" } },
              },
              properties: { source: "routes_map" },
            },
          },
        },
      },
      relationships: {
        list: { data: { type: "list", id: KLAVIYO_LIST_ID } },
      },
    },
  };

  const res = await fetch(KLAVIYO_SUBSCRIBE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Matches the Worker. 2024-10-15 rejects the consent object outright:
      // "'subscriptions' is not a valid field for the resource 'profile'".
      revision: "2025-07-15",
    },
    body: JSON.stringify(body),
  });

  // Klaviyo returns 202 Accepted on success (no body).
  if (!res.ok && res.status !== 202) {
    // Surface Klaviyo's own reason in the console. The rider still just sees
    // "try again", but a silent 400 is what made this hard to diagnose the
    // first time — a validation error should never be invisible again.
    let detail = "";
    try {
      const err = await res.json();
      detail = (err.errors || []).map((e) => e.detail || e.title).join("; ");
    } catch (_) {
      /* no JSON body — the status is all we have */
    }
    console.error("Klaviyo subscribe failed", res.status, detail);
    throw new Error(`Subscription failed (${res.status})`);
  }
}

export function setupGate() {
  const gate = document.getElementById("gate");
  const form = document.getElementById("gate-form");
  const emailInput = document.getElementById("gate-email");
  const errorEl = document.getElementById("gate-error");
  const submitBtn = form.querySelector(".gate__submit");

  function open() {
    gate.classList.add("is-open");
    gate.setAttribute("aria-hidden", "false");
    errorEl.hidden = true;
    setTimeout(() => emailInput.focus(), 50);
  }
  function close() {
    gate.classList.remove("is-open");
    gate.setAttribute("aria-hidden", "true");
    pendingRoute = null;
  }

  gate.querySelectorAll("[data-gate-close]").forEach((el) =>
    el.addEventListener("click", close)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && gate.classList.contains("is-open")) close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Joining…";
    try {
      await subscribe(email);
      markSubscribed();
      const route = pendingRoute;
      close();
      if (route) startDownload(route);
    } catch (err) {
      // Say what actually happened. "Something went wrong" told nobody
      // anything — not the rider, and not us when this was reported.
      console.error("Gate subscribe failed:", err);
      errorEl.textContent = err.message
        ? `Couldn't sign you up — ${err.message}`
        : "Something went wrong — try again.";
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Get the route";
    }
  });

  // The public API: call this from the Download GPX button.
  return function requestDownload(route) {
    if (alreadySubscribed()) {
      startDownload(route);
    } else {
      pendingRoute = route;
      open();
    }
  };
}
