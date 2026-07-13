// Bush Riding menu — the seamless quartered nav shared with bushriding.cc.
// Opens from the "Menu" button with a clip-path expand; the account quarter
// hooks into the map's own sign-in (window.brmAuth) so "My Submissions" and
// the store/socials all live in one place.
(function () {
  "use strict";

  var overlay = document.getElementById("brm-menu");
  var openBtn = document.getElementById("brm-menu-open");
  var closeBtn = document.getElementById("brm-menu-close");
  if (!overlay || !openBtn) return;

  function setOrigin() {
    var r = openBtn.getBoundingClientRect();
    overlay.style.setProperty("--brm-cx", r.left + r.width / 2 + "px");
    overlay.style.setProperty("--brm-cy", r.top + r.height / 2 + "px");
  }

  // Reflect the signed-in state on the account quarter each time we open.
  function syncAccount() {
    var label = overlay.querySelector("[data-brm-account-label]");
    var sub = overlay.querySelector("[data-brm-account-sub]");
    var user = window.brmAuth && window.brmAuth.user && window.brmAuth.user();
    if (user) {
      if (label) label.textContent = user.username || user.email || "My account";
      if (sub) sub.textContent = "My Submissions";
    } else {
      if (label) label.textContent = "Sign in";
      if (sub) sub.textContent = "My Submissions";
    }
  }

  function open() {
    setOrigin();
    syncAccount();
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    openBtn.setAttribute("aria-expanded", "true");
    if (closeBtn) closeBtn.focus();
  }
  function close(focusBtn) {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    openBtn.setAttribute("aria-expanded", "false");
    if (focusBtn) openBtn.focus();
  }

  openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", function () { close(true); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) close(true);
  });

  // Account quarter → the map's existing sign-in / My Submissions flow.
  var accountBtn = document.getElementById("brm-q-account");
  if (accountBtn) {
    accountBtn.addEventListener("click", function () {
      close(false);
      var user = window.brmAuth && window.brmAuth.user && window.brmAuth.user();
      if (user) {
        var mine = document.getElementById("my-rides-btn");
        if (mine) mine.click();
      } else if (window.brmAuth && window.brmAuth.openAuth) {
        window.brmAuth.openAuth();
      }
    });
  }

  // Close when a real link (Shop / Bush Map / socials with a URL) is followed.
  overlay.addEventListener("click", function (e) {
    var link = e.target.closest("a[href]");
    if (link && link.getAttribute("href") !== "#") close(false);
  });
})();
