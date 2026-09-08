/* Bush Riding theme skin — behaviour. The `alpine`/`alp-` naming is historical:
   the skin was cut from the ALP1NE design study, which no longer lives here.
   Written to survive the Shopify theme editor: the editor re-renders section
   HTML in place, so everything here either re-initialises on
   shopify:section:load or works via delegation/polling that doesn't care
   when the DOM is swapped out. */
(function () {
  'use strict';

  var DESIGN_MODE = window.Shopify && window.Shopify.designMode;

  /* ── Live clock — minimalist: "14:07 AEST" ──
     The element is re-queried every tick so a re-rendered header keeps a
     working clock without re-binding anything. */
  function tick() {
    var clock = document.querySelector('[data-alp-clock]');
    if (!clock) return;
    var tz = clock.getAttribute('data-alp-clock') || 'Australia/Brisbane';
    var label = clock.getAttribute('data-alp-clock-label') || 'AEST';
    var time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: tz
    }).format(new Date());
    clock.textContent = time + ' ' + label;
  }
  tick();
  setInterval(tick, 10000);

  /* ── Deferred video ──
     Nothing with a `data-alp-video` src is fetched until it is actually wanted.
     This matters more than it looks: the Explore overlay is hidden with
     visibility/clip-path rather than display:none, so a plain `<video autoplay>`
     inside it is still laid out — and still downloads and plays — on every page
     of the site, for a panel most visitors never open. Now the overlay's clips
     load when the overlay opens, and everything else loads when it scrolls
     near the viewport.

     The src goes on the element rather than a <source type="...">: the type
     attribute is a promise about the container, and a .mov labelled video/mp4
     is one some browsers refuse outright. Let the browser sniff it. */
  function playVideo(el) {
    if (!el.getAttribute('src')) {
      var src = el.getAttribute('data-alp-video');
      if (!src) return;
      el.setAttribute('src', src);
      el.load();
    }
    var played = el.play();
    /* Autoplay refusal is a normal outcome, not an error worth surfacing. */
    if (played && played.catch) played.catch(function () {});
  }

  var videoIo = null;

  function initVideos() {
    var targets = document.querySelectorAll('[data-alp-video]');
    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) {
        if (!el.closest('[data-alp-menu]')) playVideo(el);
      });
      return;
    }
    if (!videoIo) {
      videoIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          playVideo(entry.target);
          videoIo.unobserve(entry.target);
        });
      }, { rootMargin: '200px' });
    }
    targets.forEach(function (el) {
      /* The overlay's own clips are handled on open, not on scroll — it is
         permanently "in view" while hidden. */
      if (el.closest('[data-alp-menu]')) return;
      videoIo.observe(el);
    });
  }

  /* ── Quartered menu overlay — opens with a clip-path expand from the corner.
     Delegated so a re-rendered header keeps working. */
  function closeMenu(focusBtn) {
    var overlay = document.querySelector('[data-alp-menu]');
    var openBtn = document.querySelector('[data-alp-menu-open]');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('alp-menu-open');
    /* Stop paying for playback the moment it is off screen again. */
    overlay.querySelectorAll('video').forEach(function (v) { v.pause(); });
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'false');
      if (focusBtn) openBtn.focus();
    }
  }

  document.addEventListener('click', function (e) {
    var overlay = document.querySelector('[data-alp-menu]');
    var openBtn = document.querySelector('[data-alp-menu-open]');
    if (!overlay) return;

    if (e.target.closest('[data-alp-menu-open]')) {
      /* Expand from the Explore button's centre. Set the origin, then force a
         style flush so the CLOSED clip-path is recomputed at the new origin
         before we open — otherwise the very first click interpolates position
         from the default top-right corner instead of growing from the button. */
      if (openBtn) {
        var r = openBtn.getBoundingClientRect();
        overlay.style.setProperty('--alp-cx', (r.left + r.width / 2) + 'px');
        overlay.style.setProperty('--alp-cy', (r.top + r.height / 2) + 'px');
        void overlay.offsetWidth; /* flush: commit the new origin to the closed state */
      }
      /* Lazy-load the live map and the panel clips only once the menu opens. */
      var mapFrame = overlay.querySelector('[data-alp-map-src]');
      if (mapFrame && !mapFrame.src) mapFrame.src = mapFrame.getAttribute('data-alp-map-src');
      overlay.querySelectorAll('[data-alp-video]').forEach(playVideo);
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.classList.add('alp-menu-open');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
      var closeBtn = overlay.querySelector('[data-alp-menu-close]');
      if (closeBtn) closeBtn.focus();
    } else if (e.target.closest('[data-alp-menu-close]')) {
      closeMenu(true);
    } else if (e.target.closest('[data-alp-menu-link]')) {
      closeMenu(false); /* let the link navigate */
    }
  });

  document.addEventListener('keydown', function (e) {
    var overlay = document.querySelector('[data-alp-menu]');
    if (e.key === 'Escape' && overlay && overlay.classList.contains('is-open')) closeMenu(true);
  });

  /* ── Scroll reveal ──
     Skipped entirely in the theme editor (sections are re-rendered on every
     tweak and would come back opacity-0); alpine.css also forces visibility
     under .shopify-design-mode as a belt-and-suspenders. */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var io = null;

  function initReveals() {
    var targets = document.querySelectorAll('.alp-reveal:not(.is-in)');
    if (DESIGN_MODE || reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });
    }
    targets.forEach(function (el) { io.observe(el); });
  }

  initReveals();
  initVideos();

  /* Editor hooks: re-run setup whenever a section is (re)loaded. */
  document.addEventListener('shopify:section:load', function () {
    initReveals();
    initVideos();
  });
})();
