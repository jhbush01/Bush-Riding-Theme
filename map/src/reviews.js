// Community route reviews (additive). Renders the "Reviews" section + aggregate
// rating on the route card, and drives the add/edit review modal + photo
// lightbox. Auth is shared with the diary via window.brmAuth (one sign-in UI).
//
// Backed by the diary Worker: GET /reviews?route_id=… (public, with aggregate),
// POST /reviews (signed-in, multipart upsert), POST /reviews/:id/delete.

const API = (window.BRM_CONFIG?.diaryApi || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);

let routeId = null; // route currently shown in the card
let routeName = "";
let mine = null; // the signed-in user's existing review (for edit), or null
let selectedStars = 0;
let photoRemoved = false;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function stars(n, max = 5) {
  const r = Math.round(n);
  let s = "";
  for (let i = 1; i <= max; i++) s += i <= r ? "★" : "☆";
  return s;
}
function timeAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!isFinite(d)) return "";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30.4);
  if (m < 12) return `${m} month${m === 1 ? "" : "s"} ago`;
  return `${(d / 365).toFixed(1)} years ago`;
}
function token() {
  return (window.brmAuth && window.brmAuth.token()) || null;
}
function withTok(url) {
  const t = token();
  return t ? url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t) : url;
}

/* ---------------- public API (called by map.js) ---------------- */
window.brmReviews = {
  show(id, name) {
    routeId = id || null;
    routeName = name || "";
    mine = null;
    hideRating(); // clear the previous route's rating/list until the fetch lands
    const list = $("review-list");
    if (list) list.innerHTML = "";
    const empty = $("review-empty");
    if (empty) empty.hidden = true;
    load();
  },
  reset() {
    routeId = null;
    hideRating();
    const list = $("review-list");
    if (list) list.innerHTML = "";
  },
};

function hideRating() {
  const r = $("detail-rating");
  if (r) r.hidden = true;
}

/* ---------------- load + render ---------------- */
async function load() {
  if (!API || !routeId) return hideRating();
  let data;
  try {
    const res = await fetch(withTok(`${API}/reviews?route_id=${encodeURIComponent(routeId)}`));
    data = await res.json();
    if (!res.ok) throw new Error(data && data.error);
  } catch (_) {
    // Reviews are an enhancement — a failure just leaves the section empty.
    hideRating();
    renderList({ reviews: [] });
    return;
  }
  mine = data.mine || null;
  renderRating(data);
  renderList(data);
}

function renderRating(data) {
  const wrap = $("detail-rating");
  if (!wrap) return;
  if (!data.count) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  $("detail-rating-stars").textContent = stars(data.average);
  $("detail-rating-avg").textContent = data.average.toFixed(1);
  $("detail-rating-count").textContent = `${data.count} review${data.count === 1 ? "" : "s"}`;
}

function renderList(data) {
  const list = $("review-list");
  const empty = $("review-empty");
  const addBtn = $("review-add");
  if (!list) return;
  const reviews = data.reviews || [];
  empty.hidden = reviews.length > 0;
  if (addBtn) addBtn.title = mine ? "Edit your review" : "Add a review";

  list.innerHTML = reviews
    .map(
      (r) => `
      <li class="review${r.mine ? " is-mine" : ""}">
        <div class="review__head">
          <span class="review__stars" aria-label="${r.rating} out of 5">${stars(r.rating)}</span>
          <span class="review__by">${esc(r.username)}${r.mine ? " · you" : ""}</span>
          <span class="review__time">${esc(timeAgo(r.created_at))}${r.edited ? " · edited" : ""}</span>
        </div>
        ${r.comment ? `<p class="review__text">${esc(r.comment)}</p>` : ""}
        ${
          r.photo_url
            ? `<button type="button" class="review__photo" data-photo="${esc(r.photo_url)}"><img src="${esc(r.photo_url)}" alt="Ride photo from ${esc(r.username)}" loading="lazy" /></button>`
            : ""
        }
        <div class="review__actions">
          ${r.mine ? `<button type="button" class="button-link" data-edit>Edit</button>` : ""}
          ${r.can_delete ? `<button type="button" class="button-link button-link--danger" data-del="${esc(r.id)}">${r.mine ? "Delete" : "Remove"}</button>` : ""}
        </div>
      </li>`
    )
    .join("");
}

/* ---------------- add / edit modal ---------------- */
function onAdd() {
  // A token is enough to try — the server is the source of truth (it enforces
  // auth, and a username, on POST). This avoids depending on the diary's
  // session check having completed, which is tied to the map loading.
  const signedIn = window.brmAuth && (window.brmAuth.isSignedIn() || window.brmAuth.token());
  if (!signedIn) {
    if (window.brmAuth) window.brmAuth.openAuth();
    return;
  }
  if (window.brmAuth.needsUsername && window.brmAuth.needsUsername()) {
    window.brmAuth.ensureUsername(() => onAdd());
    return;
  }
  openReview(mine);
}

function openReview(existing) {
  photoRemoved = false;
  $("review-error").hidden = true;
  $("review-form").reset();
  $("review-modal-route").textContent = routeName || "";
  $("review-modal-title").textContent = existing ? "Edit your review" : "Rate this route";
  $("review-submit").textContent = existing ? "Save changes" : "Post review";
  setStars(existing ? existing.rating : 0);
  $("review-comment").value = existing ? existing.comment || "" : "";

  // Existing photo preview (with a remove control).
  const cur = $("review-photo-current");
  if (existing && existing.photo_url) {
    $("review-photo-thumb").src = existing.photo_url;
    cur.hidden = false;
  } else {
    cur.hidden = true;
  }
  $("review-photo-label").textContent = "＋ Add a photo from your ride (optional)";
  $("review-delete").hidden = !existing;

  $("review-modal").classList.add("is-open");
  $("review-modal").setAttribute("aria-hidden", "false");
}
function closeReview() {
  $("review-modal").classList.remove("is-open");
  $("review-modal").setAttribute("aria-hidden", "true");
}
function setStars(n) {
  selectedStars = n;
  $("review-stars")
    .querySelectorAll(".star-input__btn")
    .forEach((b) => b.classList.toggle("is-on", Number(b.dataset.star) <= n));
}

async function onSubmit(e) {
  e.preventDefault();
  const err = $("review-error");
  err.hidden = true;
  if (selectedStars < 1) {
    err.textContent = "Pick a rating from 1 to 5 stars.";
    err.hidden = false;
    return;
  }
  const fd = new FormData();
  fd.append("route_id", routeId);
  fd.append("rating", String(selectedStars));
  fd.append("comment", $("review-comment").value.trim());
  const photo = $("review-photo").files[0];
  if (photo) fd.append("photo", photo);
  if (photoRemoved) fd.append("remove_photo", "1");

  const btn = $("review-submit");
  btn.disabled = true;
  try {
    const res = await fetch(withTok(`${API}/reviews`), { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.needsUsername) {
        closeReview();
        window.brmAuth.ensureUsername(() => onAdd());
        return;
      }
      if (res.status === 401) {
        // Token missing/expired — send them through sign-in and stop.
        closeReview();
        if (window.brmAuth) window.brmAuth.openAuth();
        return;
      }
      throw new Error(data.error || "Couldn't post that review.");
    }
    closeReview();
    load();
  } catch (e2) {
    err.textContent = e2.message || "Something went wrong.";
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
}

async function del(id) {
  if (!id || !confirm("Delete this review?")) return;
  try {
    const res = await fetch(withTok(`${API}/reviews/${id}/delete`), { method: "POST" });
    if (!res.ok) throw new Error();
  } catch (_) {
    /* ignore — reload reflects reality either way */
  }
  closeReview();
  load();
}

/* ---------------- lightbox ---------------- */
function openLightbox(src) {
  $("lightbox-img").src = src;
  $("lightbox").classList.add("is-open");
  $("lightbox").setAttribute("aria-hidden", "false");
}
function closeLightbox() {
  $("lightbox").classList.remove("is-open");
  $("lightbox").setAttribute("aria-hidden", "true");
  $("lightbox-img").src = "";
}

/* ---------------- wiring ---------------- */
function wire() {
  const add = $("review-add");
  if (!add) return; // markup not present — nothing to wire
  add.addEventListener("click", onAdd);
  const rating = $("detail-rating");
  if (rating) rating.addEventListener("click", () => $("detail-reviews").scrollIntoView({ behavior: "smooth", block: "start" }));

  $("review-form").addEventListener("submit", onSubmit);
  $("review-stars")
    .querySelectorAll(".star-input__btn")
    .forEach((b) => b.addEventListener("click", () => setStars(Number(b.dataset.star))));
  $("review-photo").addEventListener("change", () => {
    photoRemoved = false;
    const f = $("review-photo").files[0];
    $("review-photo-label").textContent = f ? `Selected: ${f.name}` : "＋ Add a photo from your ride (optional)";
  });
  $("review-photo-remove").addEventListener("click", () => {
    photoRemoved = true;
    $("review-photo-current").hidden = true;
    $("review-photo").value = "";
  });
  $("review-delete").addEventListener("click", () => mine && del(mine.id));
  document.querySelectorAll("[data-review-close]").forEach((el) => el.addEventListener("click", closeReview));

  // Review list actions (delegated): photo lightbox, edit, remove.
  $("review-list").addEventListener("click", (e) => {
    const photo = e.target.closest("[data-photo]");
    if (photo) return openLightbox(photo.dataset.photo);
    const edit = e.target.closest("[data-edit]");
    if (edit) return openReview(mine);
    const rm = e.target.closest("[data-del]");
    if (rm) return del(rm.dataset.del);
  });

  // Lightbox close (button or backdrop click).
  $("lightbox").addEventListener("click", (e) => {
    if (e.target.closest("[data-lightbox-close]") || e.target.id === "lightbox") closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("lightbox").classList.contains("is-open")) closeLightbox();
    else if ($("review-modal").classList.contains("is-open")) closeReview();
  });

  // Re-render when sign-in state changes (shows edit/delete affordances).
  if (window.brmAuth) window.brmAuth.onChange(() => routeId && load());
}

wire();
