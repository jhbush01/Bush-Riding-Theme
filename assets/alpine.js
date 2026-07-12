/* ALP1NE™ theme skin — behaviour, translated from the alp1ne/ design study. */
(function () {
  'use strict';

  /* ── Live clock — "14:07:59 (PST) Tuesday July 7 2026" ── */
  var clock = document.querySelector('[data-alp-clock]');

  function tick() {
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

  if (clock) {
    tick();
    setInterval(tick, 1000);
  }

  /* ── Header background on scroll ── */
  var header = document.querySelector('[data-alp-header]');

  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  }

  if (header) {
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Menu overlay ── */
  var overlay = document.querySelector('[data-alp-menu]');
  var openBtn = document.querySelector('[data-alp-menu-open]');
  var closeBtn = document.querySelector('[data-alp-menu-close]');

  function openMenu() {
    overlay.hidden = false;
    openBtn.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }

  function closeMenu() {
    overlay.hidden = true;
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.focus();
  }

  if (overlay && openBtn && closeBtn) {
    openBtn.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.querySelectorAll('[data-alp-menu-link]').forEach(function (link) {
      link.addEventListener('click', function () {
        overlay.hidden = true;
        openBtn.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) closeMenu();
    });
  }

  /* ── Scroll reveal ── */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targets = document.querySelectorAll('.alp-reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    targets.forEach(function (el) { io.observe(el); });
  }
})();
