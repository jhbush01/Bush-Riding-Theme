// Email gate. Browsing is free; the gate fires only on "Download GPX".
// On submit we POST to Klaviyo's client-side subscriptions flow
// (revision 2024-10-15) — the same integration pattern as the landing page —
// then set a session flag and trigger the real download. Subsequent
// downloads in the same session skip the modal.

// --- Config: set these to the same values the landing page uses ---------
// KLAVIYO_COMPANY_ID is the public company id (a.k.a. site id / public API key).
// KLAVIYO_LIST_ID is the existing list that is the system of record.
const KLAVIYO_COMPANY_ID = window.BRM_CONFIG?.klaviyoCompanyId || "REPLACE_COMPANY_ID";
const KLAVIYO_LIST_ID = window.BRM_CONFIG?.klaviyoListId || "REPLACE_LIST_ID";
// ------------------------------------------------------------------------

const SESSION_KEY = "brm_subscribed";
const SUBSCRIBE_URL = `https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_COMPANY_ID}`;

let pendingRoute = null;

function startDownload(route) {
  const a = document.createElement("a");
  a.href = route.gpx_url;
  a.download = route.id + ".gpx";
  document.body.appendChild(a);
  a.click();
  a.remove();
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

async function subscribe(email) {
  const body = {
    data: {
      type: "subscription",
      attributes: {
        profile: {
          data: {
            type: "profile",
            attributes: {
              email,
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

  const res = await fetch(SUBSCRIBE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      revision: "2024-10-15",
    },
    body: JSON.stringify(body),
  });

  // Klaviyo returns 202 Accepted on success (no body).
  if (!res.ok && res.status !== 202) {
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
      errorEl.textContent = "Something went wrong — try again.";
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
