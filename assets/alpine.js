/* Bush Riding theme skin — behaviour. The `alpine`/`alp-` naming is historical:
   the skin was cut from the ALP1NE design study, which no longer lives here.
   Written to survive the Shopify theme editor: the editor re-renders section
   HTML in place, so everything here either re-initialises on
   shopify:section:load or works via delegation/polling that doesn't care
   when the DOM is swapped out. */
(function () {
  'use strict';

  var DESIGN_MODE = window.Shopify && window.Shopify.designMode;

  /* ── Deferred video ──
     Nothing with a `data-alp-video` src is fetched until it is actually wanted.
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
      targets.forEach(playVideo);
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
    targets.forEach(function (el) { videoIo.observe(el); });
  }

  /* ── Menu sheet (mobile) ──
     Rises from the bottom, because the chip that opens it is at the bottom.
     Delegated so a re-rendered header keeps working. */

  /* overflow:hidden alone does not hold on iOS Safari — the page behind a sheet
     still scrolls under your thumb, and worse, it has silently scrolled to the
     top by the time you close it. Pinning the body and restoring the offset is
     the only thing that reliably works there. */
  var sheetScrollY = 0;

  function lockScroll() {
    sheetScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = -sheetScrollY + 'px';
    document.body.classList.add('alp-menu-open');
  }

  function unlockScroll() {
    document.body.classList.remove('alp-menu-open');
    document.body.style.top = '';
    window.scrollTo(0, sheetScrollY);
  }

  /* Everything focusable and actually visible inside the sheet. */
  function sheetFocusables(sheet) {
    var sel = 'a[href], button:not([disabled]), input:not([disabled]), ' +
              'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return [].slice.call(sheet.querySelectorAll(sel)).filter(function (el) {
      return el.getClientRects().length > 0;
    });
  }

  function closeMenu(focusBtn) {
    var sheet = document.querySelector('[data-alp-menu]');
    var openBtn = document.querySelector('[data-alp-menu-open]');
    if (!sheet) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    unlockScroll();
    if (openBtn) {
      openBtn.setAttribute('aria-expanded', 'false');
      if (focusBtn) openBtn.focus();
    }
  }

  document.addEventListener('click', function (e) {
    var sheet = document.querySelector('[data-alp-menu]');
    if (!sheet) return;

    if (e.target.closest('[data-alp-menu-open]')) {
      var openBtn = document.querySelector('[data-alp-menu-open]');
      sheet.classList.add('is-open');
      sheet.setAttribute('aria-hidden', 'false');
      lockScroll();
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
      var closeBtn = sheet.querySelector('[data-alp-menu-close]');
      if (closeBtn) closeBtn.focus();
    } else if (e.target.closest('[data-alp-menu-close]')) {
      closeMenu(true);
    } else if (e.target.closest('[data-alp-menu-link]')) {
      closeMenu(false); /* let the link navigate */
    }
  });

  document.addEventListener('keydown', function (e) {
    var sheet = document.querySelector('[data-alp-menu]');
    if (!sheet || !sheet.classList.contains('is-open')) return;

    if (e.key === 'Escape') { closeMenu(true); return; }

    /* Keep focus inside the sheet. Without this, tabbing walks straight out of
       an open dialog and into the page behind it, which for anyone not using a
       mouse means the sheet is open and they are somewhere else. */
    if (e.key !== 'Tab') return;
    var list = sheetFocusables(sheet);
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!sheet.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ── Next ride ──
     The date appears in up to four places at once (rail foot, home card, menu
     sheet, journal foot) and nobody should have to remember to update it before
     a ride, so it comes from the routes worker's public /events feed — the same
     feed the map draws its Bush Event pins from.

     The blocks ship `hidden` and are only revealed once a ride resolves. That
     is the whole failure strategy: no feed, no upcoming ride, no network — the
     page reads as though the block was never there, which is strictly better
     than a stale November date sitting on the site in December.

     The answer is cached in `ride` so the editor's re-renders re-fill the new
     DOM without hitting the network again. */
  var ride = null;
  var rideAsked = false;

  function rideConfig() {
    var el = document.querySelector('[data-alp-rail]');
    if (!el) return null;
    return {
      api: el.getAttribute('data-alp-events-api') || '',
      eventsUrl: el.getAttribute('data-alp-events-url') || '',
      mapUrl: el.getAttribute('data-alp-map-url') || ''
    };
  }

  function fill(el, sel, value) {
    var target = el.querySelector(sel);
    if (target) target.textContent = value || '';
  }

  function applyRide() {
    if (!ride) return;
    var blocks = document.querySelectorAll('[data-alp-next-ride]');
    if (!blocks.length) return;

    blocks.forEach(function (el) {
      fill(el, '[data-nr-date]', ride.when);
      fill(el, '[data-nr-place]', ride.place);
      fill(el, '[data-nr-note]', ride.note);
      /* On the card and the panel the block itself is the link; in the rail the
         link is a row inside it. */
      var link = el.hasAttribute('data-nr-link') ? el : el.querySelector('[data-nr-link]');
      if (link && ride.href) link.setAttribute('href', ride.href);
      el.hidden = false;
    });
  }

  function pickRide(features, cfg) {
    /* date_iso sorts correctly as a string — comparing the ISO prefix avoids
       parsing a date in the visitor's timezone and landing a day out. */
    var today = new Date().toISOString().slice(0, 10);

    var upcoming = features.filter(function (f) {
      var p = (f && f.properties) || {};
      if (!p.date_iso) return false;
      if (p.status && p.status !== 'upcoming') return false;
      return String(p.date_iso).slice(0, 10) >= today;
    }).sort(function (a, b) {
      return String(a.properties.date_iso).localeCompare(String(b.properties.date_iso));
    });

    if (!upcoming.length) return null;
    var p = upcoming[0].properties;

    /* The map selects by hash for ROUTES only (map.js selectFromHash), so an
       event reaches the map through the route it runs on. Without one, the
       events index is the closest honest destination. */
    var href = p.route_id && cfg.mapUrl
      ? cfg.mapUrl.replace(/\/$/, '') + '/#' + encodeURIComponent(p.route_id)
      : cfg.eventsUrl;

    return {
      when: p.date_display ? (p.time ? p.date_display + ', ' + p.time : p.date_display) : p.time,
      place: p.meeting_point || p.name,
      note: p.subtitle || '',
      href: href
    };
  }

  function initNextRide() {
    if (!document.querySelector('[data-alp-next-ride]')) return;
    if (rideAsked) { applyRide(); return; }

    var cfg = rideConfig();
    if (!cfg || !cfg.api) return;
    rideAsked = true;

    fetch(cfg.api.replace(/\/$/, '') + '/events', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.features) return;
        ride = pickRide(data.features, cfg);
        applyRide();
      })
      .catch(function () { /* no ride shown; the block stays hidden */ });
  }

  /* ── The rail's buy block (desktop product page) ──
     It owns no state. The size buttons click the REAL radio inside
     <variant-selects> — exactly what a visitor clicking the on-page picker
     does — and Add to cart submits Dawn's own form, so the drawer and
     notification behave like a native add. Everything the rail shows is then
     re-read from the page.

     This is deliberately the same mechanism sticky-atc already uses. A second
     form, or a second copy of the variant state, is how a buy button ends up
     adding the wrong variant. */
  function rpPicker() { return document.querySelector('variant-selects'); }
  function rpNative() { return document.querySelector('.product-form__submit'); }
  function rpForm() {
    return document.querySelector('product-form form[data-type="add-to-cart-form"], form[action*="/cart/add"]');
  }

  function rpFieldset(row) {
    var picker = rpPicker();
    if (!row || !picker) return null;
    var pos = parseInt(row.getAttribute('data-alp-rp-position'), 10) || 1;
    return picker.querySelectorAll('fieldset')[pos - 1] || null;
  }

  /* The page's own buy block only steps aside once we have actually found
     Dawn's form AND its button. Adding this class from script rather than
     Liquid is the whole safety property: no JS, or a form we cannot reach, and
     the page keeps the controls it has always had. */
  function claimBuyBlock(ok) {
    document.body.classList.toggle('alp-rail-buy', !!ok);
  }

  function syncRailProduct() {
    var btn = document.querySelector('[data-alp-rp-submit]');
    if (!btn) return;
    claimBuyBlock(rpForm() && rpNative());

    var priceEl = document.querySelector('[data-alp-rp-price]');
    if (priceEl) {
      var src = document.querySelector(
        '.product__info-container .price__container .price-item--sale, ' +
        '.product__info-container .price__container .price-item--regular, ' +
        '.price .price-item--regular'
      );
      if (src) priceEl.textContent = src.textContent.trim();
    }

    var native = rpNative();
    if (native) {
      var soldOut = native.disabled || native.getAttribute('aria-disabled') === 'true';
      btn.disabled = soldOut;
      /* Take the wording from the native button so this follows the store's
         own locale rather than hard-coding English here. */
      var label = native.querySelector('span');
      btn.textContent = label ? label.textContent.trim() : (soldOut ? 'Sold out' : 'Add to cart');
    }

    /* Mark whichever size the PAGE has selected, not the one last clicked. */
    var row = document.querySelector('[data-alp-rp-options]');
    var fieldset = rpFieldset(row);
    var checked = fieldset && fieldset.querySelector('input[type="radio"]:checked');
    if (row) {
      row.querySelectorAll('[data-alp-rp-value]').forEach(function (b) {
        var on = !!checked && b.getAttribute('data-alp-rp-value') === checked.value;
        b.classList.toggle('is-on', on);
        if (on) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
    }
  }

  document.addEventListener('click', function (e) {
    var size = e.target.closest('[data-alp-rp-value]');
    if (size) {
      var fieldset = rpFieldset(size.closest('[data-alp-rp-options]'));
      if (fieldset) {
        var want = size.getAttribute('data-alp-rp-value');
        var hit = null;
        fieldset.querySelectorAll('input[type="radio"]').forEach(function (r) {
          if (r.value === want) hit = r;
        });
        if (hit && !hit.disabled) hit.click();
      }
      /* Dawn swaps price and button state asynchronously after the change. */
      setTimeout(syncRailProduct, 400);
      return;
    }

    if (e.target.closest('[data-alp-rp-submit]')) {
      var form = rpForm();
      if (!form) return;
      if (form.requestSubmit) form.requestSubmit();
      else form.submit();
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target.closest('variant-selects, variant-radios, .product-form__input, [name="id"]')) {
      setTimeout(syncRailProduct, 400);
    }
  });

  /* ── Section index in the rail ──
     The rail renders before the template's own sections, so Liquid cannot tell
     it what is on the page. This collects the passages afterwards and fills the
     rail's empty slot with links to them — the About page's section index in
     8e, and anything else built out of passages.

     Only ever an index of what is already on screen, so if this never runs the
     page is exactly as complete as it was. */
  function initRailIndex() {
    /* Pages only. The home page is built out of passages too, so without this
       it grew a "Sections / The country / Bush Map" index nobody asked for —
       an index is for a long single-subject page like About, not for the front
       door, where the nav above it is already the index. */
    if (!document.body.classList.contains('template-page')) return;

    var slot = document.querySelector('[data-alp-rail-slot]');
    if (!slot || slot.children.length) return; /* a template filled it already */

    var marks = document.querySelectorAll('[data-alp-index]');
    if (marks.length < 2) return; /* one section is not an index */

    var head = document.createElement('p');
    head.className = 'alp-rail__eyebrow';
    head.textContent = slot.getAttribute('data-alp-index-label') || 'Sections';
    slot.appendChild(head);

    marks.forEach(function (el) {
      if (!el.id) return;
      var a = document.createElement('a');
      a.className = 'alp-rail__detail';
      a.href = '#' + el.id;
      a.textContent = el.getAttribute('data-alp-index');
      slot.appendChild(a);
    });
  }

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
  initNextRide();
  syncRailProduct();
  initRailIndex();

  /* Editor hooks: re-run setup whenever a section is (re)loaded. */
  document.addEventListener('shopify:section:load', function () {
    initReveals();
    initVideos();
    initNextRide();
    syncRailProduct();
  });
})();
