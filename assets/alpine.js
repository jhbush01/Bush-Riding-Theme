/* ALP1NE™ theme skin — behaviour, translated from the alp1ne/ design study.
   Written to survive the Shopify theme editor: the editor re-renders section
   HTML in place, so everything here either re-initialises on
   shopify:section:load or works via delegation/polling that doesn't care
   when the DOM is swapped out. */
(function () {
  'use strict';

  var DESIGN_MODE = window.Shopify && window.Shopify.designMode;

  /* ── Gravel tyre clock ──
     Analog hands on the tyre SVG, ticking in the timezone configured on the
     element. Elements are re-queried every tick so a re-rendered header
     keeps a working clock without re-binding anything. */
  function tzParts(tz) {
    var parts = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false, timeZone: tz
    }).formatToParts(new Date());
    var out = {};
    parts.forEach(function (p) { if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10); });
    return out;
  }

  function tick() {
    document.querySelectorAll('[data-alp-tyre]').forEach(function (tyre) {
      var tz = tyre.getAttribute('data-alp-tyre') || 'America/Los_Angeles';
      var t;
      try { t = tzParts(tz); } catch (_) { t = tzParts('UTC'); }
      var hour = tyre.querySelector('[data-alp-hand="hour"]');
      var minute = tyre.querySelector('[data-alp-hand="minute"]');
      var second = tyre.querySelector('[data-alp-hand="second"]');
      if (hour) hour.setAttribute('transform', 'rotate(' + ((t.hour % 12) * 30 + t.minute * 0.5) + ' 50 50)');
      if (minute) minute.setAttribute('transform', 'rotate(' + (t.minute * 6 + t.second * 0.1) + ' 50 50)');
      if (second) second.setAttribute('transform', 'rotate(' + (t.second * 6) + ' 50 50)');
    });
  }
  tick();
  setInterval(tick, 1000);

  /* ── Mobile: hide the header scrolling down, show it scrolling up.
     The class is toggled everywhere but only styled under the mobile
     breakpoint, so desktop is unaffected. */
  var lastY = window.scrollY;

  window.addEventListener('scroll', function () {
    var header = document.querySelector('[data-alp-header]');
    if (!header) return;
    var y = window.scrollY;
    if (y > lastY + 4 && y > 90) {
      header.classList.add('is-hidden');
    } else if (y < lastY - 4 || y <= 90) {
      header.classList.remove('is-hidden');
    }
    lastY = y;
  }, { passive: true });

  /* ── Menu overlay — delegated, so re-rendered headers keep working ── */
  document.addEventListener('click', function (e) {
    var overlay = document.querySelector('[data-alp-menu]');
    var openBtn = document.querySelector('[data-alp-menu-open]');
    if (!overlay) return;

    if (e.target.closest('[data-alp-menu-open]')) {
      overlay.hidden = false;
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
      var closeBtn = overlay.querySelector('[data-alp-menu-close]');
      if (closeBtn) closeBtn.focus();
    } else if (e.target.closest('[data-alp-menu-close]') || e.target.closest('[data-alp-menu-link]')) {
      overlay.hidden = true;
      if (openBtn) {
        openBtn.setAttribute('aria-expanded', 'false');
        if (e.target.closest('[data-alp-menu-close]')) openBtn.focus();
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    var overlay = document.querySelector('[data-alp-menu]');
    if (e.key === 'Escape' && overlay && !overlay.hidden) {
      overlay.hidden = true;
      var openBtn = document.querySelector('[data-alp-menu-open]');
      if (openBtn) { openBtn.setAttribute('aria-expanded', 'false'); openBtn.focus(); }
    }
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

  /* Editor hooks: re-run reveal setup whenever a section is (re)loaded. */
  document.addEventListener('shopify:section:load', initReveals);
})();
