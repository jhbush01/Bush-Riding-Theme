(function () {
  'use strict';

  /* ── Live clock — "14:07:59 (PST) Tuesday July 7 2026", pinned to US Pacific ── */
  var clock = document.querySelector('[data-clock]');

  function tick() {
    var now = new Date();
    var time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'America/Los_Angeles'
    }).format(now);
    var date = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      timeZone: 'America/Los_Angeles'
    }).format(now).replace(/,/g, '');
    clock.textContent = time + ' (PST) ' + date;
  }

  if (clock) {
    tick();
    setInterval(tick, 1000);
  }

  /* ── Header background on scroll ── */
  var header = document.querySelector('[data-header]');

  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  }

  if (header) {
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Menu overlay ── */
  var overlay = document.querySelector('[data-menu]');
  var openBtn = document.querySelector('[data-menu-open]');
  var closeBtn = document.querySelector('[data-menu-close]');

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
    overlay.querySelectorAll('[data-menu-link]').forEach(function (link) {
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
  var targets = document.querySelectorAll('.reveal');

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

  /* ── Newsletter (static site: confirm inline, no network) ── */
  var form = document.querySelector('[data-newsletter]');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = document.createElement('p');
      note.className = 'foot__note';
      note.setAttribute('role', 'status');
      note.textContent = 'Thanks — you’re on the list.';
      form.replaceWith(note);
    });
  }
})();
