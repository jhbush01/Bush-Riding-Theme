/* ALP1NE™ theme skin — behaviour, translated from the alp1ne/ design study.
   Written to survive the Shopify theme editor: the editor re-renders section
   HTML in place, so everything here either re-initialises on
   shopify:section:load or works via delegation/polling that doesn't care
   when the DOM is swapped out. */
(function () {
  'use strict';

  var DESIGN_MODE = window.Shopify && window.Shopify.designMode;

  /* ── Live clock — "14:07:59 (PST) Tuesday July 7 2026" ──
     The element is re-queried every tick so a re-rendered header keeps a
     working clock without re-binding anything. */
  function tick() {
    var clock = document.querySelector('[data-alp-clock]');
    if (!clock) return;
    var tz = clock.getAttribute('data-alp-clock') || 'America/Los_Angeles';
    var label = clock.getAttribute('data-alp-clock-label') || 'PST';
    var now = new Date();
    var time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: tz
    }).format(now);
    var date = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: tz
    }).format(now).replace(/,/g, '');
    clock.textContent = time + ' (' + label + ') ' + date;
  }
  tick();
  setInterval(tick, 1000);

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
