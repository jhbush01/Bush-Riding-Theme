/* Bush Riding storefront — behaviour for the October 2026 redesign.

   Written for the Shopify theme editor: the editor re-renders section HTML in
   place, so everything here is either delegated from `document` (and so
   doesn't care when the DOM is swapped) or re-run on shopify:section:load.

   Nothing on the page depends on this file to work. Without it, Quick add and
   Add to cart post to /cart/add, Buy now posts with return_to=/checkout, the
   cart steppers are /cart/change links, and filters are a plain GET form.
   This file makes those steps happen in place — that is what keeps checkout
   to three taps. */
(function () {
  'use strict';

  var DESIGN_MODE = !!(window.Shopify && window.Shopify.designMode);
  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DESKTOP = window.matchMedia('(min-width: 750px)');
  var ROOT = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); }
  function header() { return $('[data-alp-header]'); }
  function cfg(name) { var h = header(); return h ? h.getAttribute('data-alp-' + name) || '' : ''; }

  /* ── Toast — one polite live region for anything that goes wrong ── */
  function toast(msg) {
    var t = $('#alp-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'alp-toast';
      t.className = 'alp alp-toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('is-on'); }, 4200);
  }

  /* ── Panels: header panels, drawer, sheets, filters ──────────────────────
     One open at a time. Header panels (Bush Map, the phone menu) drop under
     the bar with the page dimmed beneath; the drawer and sheets dim the bar
     too. Escape, the scrim and any [data-alp-close] close them. */
  var openId = null;
  var lastFocus = null;

  function isModal(el) { return el.hasAttribute('data-alp-drawer') || el.hasAttribute('data-alp-sheet'); }
  function isSheetNow(el) {
    /* The filters panel is a sheet on a phone and an in-page panel on desktop. */
    if (el.id === 'alp-filters') return !DESKTOP.matches;
    return isModal(el);
  }

  function lock() {
    document.body.classList.add('alp-locked');
  }
  function unlock() {
    document.body.classList.remove('alp-locked');
  }

  function scrim(on, over) {
    var s = $('[data-alp-scrim]');
    if (!s) return;
    if (on) {
      s.hidden = false;
      s.classList.toggle('is-over', !!over);
      void s.offsetWidth;
      s.classList.add('is-open');
    } else {
      s.classList.remove('is-open');
      setTimeout(function () { if (!openId) { s.hidden = true; s.classList.remove('is-over'); } }, REDUCE ? 0 : 250);
    }
  }

  function setExpanded(id, on) {
    $$('[data-alp-toggle="' + id + '"]').forEach(function (b) { b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
    /* A header menu is open: the header shows its bone bar (alpine.css). */
    document.body.classList.toggle('alp-hd-open', !!$('[data-alp-header] [aria-expanded="true"]'));
  }

  function openPanel(id, opts) {
    var el = document.getElementById(id);
    if (!el) return;
    if (openId === id) return;
    if (openId) closePanel(true);
    openId = id;
    lastFocus = (opts && opts.focusFrom) || document.activeElement;

    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('is-open');
    setExpanded(id, true);

    var inPage = id === 'alp-filters' && DESKTOP.matches;
    if (!inPage) {
      /* Sheets dim the header too (M05, M06a/b); the desktop drawer leaves it
         lit (D07), as do the header's own panels. */
      scrim(true, el.hasAttribute('data-alp-sheet'));
      if (isSheetNow(el) || id === 'alp-menu' || (id === 'alp-searchmenu' && !DESKTOP.matches)) lock();
    }

    if (isModal(el) || (id === 'alp-filters' && !DESKTOP.matches)) {
      var f = el.querySelector('[data-alp-close], button, a[href], input');
      if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 30);
    }
    if (id === 'alp-mapmenu') fillNearList();
    if (id === 'alp-ridesmenu') fillRidesList();
    if (id === 'alp-searchmenu') {
      fillPopular($('[data-alp-popular]', el));
      var field = $('[data-alp-live-search]', el);
      if (field) setTimeout(function () { field.focus({ preventScroll: true }); }, 30);
    }
  }

  function closePanel(quiet) {
    if (!openId) return;
    var el = document.getElementById(openId);
    var id = openId;
    openId = null;
    setExpanded(id, false);
    if (el) {
      el.classList.remove('is-open');
      setTimeout(function () { if (openId !== id) el.hidden = true; }, REDUCE ? 0 : 250);
    }
    unlock();
    scrim(false);
    if (!quiet && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var toggle = t.closest('[data-alp-toggle]');
    /* A toggle marked data-alp-follow navigates on click (desktop) instead of
       opening its panel; the nav menus don't use it, so iPads get them. */
    if (toggle && toggle.hasAttribute('data-alp-follow') && DESKTOP.matches) { closePanel(true); return; }
    if (toggle) {
      e.preventDefault();
      /* A tap fires a synthetic mouseover first; its pending hover-open must
         not reopen a menu this tap is closing (iPad, no real hover). */
      clearTimeout(hoverT);
      var id = toggle.getAttribute('data-alp-toggle');
      /* A hover that has just opened the panel shouldn't be undone by the
         click that usually follows it. */
      if (openId === id && Date.now() - hoverOpenedAt < 700) return;
      if (openId === id) closePanel(); else openPanel(id, { focusFrom: toggle });
      return;
    }
    if (t.closest('[data-alp-scrim]')) { closePanel(); return; }
    var closer = t.closest('[data-alp-close]');
    if (closer) {
      /* Links that close (menu items) still navigate. */
      if (closer.tagName !== 'A') e.preventDefault();
      closePanel(closer.tagName === 'A');
      return;
    }
    if (t.closest('[data-alp-open-cart]')) {
      if (!$('#alp-cart')) return;
      e.preventDefault();
      openPanel('alp-cart', { focusFrom: t.closest('[data-alp-open-cart]') });
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!openId) return;
    if (e.key === 'Escape') { closePanel(); return; }
    if (e.key !== 'Tab') return;
    var el = document.getElementById(openId);
    if (!el || !(isModal(el) || (openId === 'alp-filters' && !DESKTOP.matches))) return;
    var list = $$('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, summary', el)
      .filter(function (n) { return n.getClientRects().length; });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });

  /* Shop, Bush Map, Rides and Search open on hover (desktop) and stay open while the
     pointer is anywhere over the header or the open panel; leaving both
     closes it. Search is the exception once it's in use — with the field
     focused or holding text it stays until Escape, the scrim, or a click
     elsewhere, so a stray mouse doesn't throw away what was typed. */
  var hoverT = null;
  var hoverOpenedAt = 0;
  function searchInUse() {
    var f = $('#alp-searchmenu [data-alp-live-search]');
    return !!f && (document.activeElement === f || f.value.trim() !== '');
  }
  document.addEventListener('mouseover', function (e) {
    if (!DESKTOP.matches) return;
    var btn = e.target.closest('[data-alp-hover]');
    if (btn) {
      var id = btn.getAttribute('data-alp-toggle');
      /* Straight away — the whole menu at once. */
      clearTimeout(hoverT);
      if (openId !== id) { hoverOpenedAt = Date.now(); openPanel(id, { focusFrom: btn }); }
      return;
    }
    var open = openId && document.getElementById(openId);
    if (!open || !open.closest('[data-alp-header]') || openId === 'alp-menu') return;
    if (e.target.closest('[data-alp-header]')) { clearTimeout(hoverT); return; }
    if (openId === 'alp-searchmenu' && searchInUse()) return;
    /* Off the header and its menu: gone at once. */
    clearTimeout(hoverT);
    closePanel(true);
  });
  /* Keyboard: tabbing onto Shop, Bush Map or Search opens its panel, so what's
     in it can be reached without a mouse. */
  document.addEventListener('focusin', function (e) {
    if (!DESKTOP.matches) return;
    var btn = e.target.closest('[data-alp-hover]');
    if (btn && e.target.matches(':focus-visible')) openPanel(btn.getAttribute('data-alp-toggle'), { focusFrom: btn });
  });

  /* Pointer gone from the window altogether. */
  document.documentElement.addEventListener('mouseleave', function () {
    if (!DESKTOP.matches || !openId || openId === 'alp-menu') return;
    var open = document.getElementById(openId);
    if (!open || !open.closest('[data-alp-header]')) return;
    if (openId === 'alp-searchmenu' && searchInUse()) return;
    clearTimeout(hoverT);
    closePanel(true);
  });

  DESKTOP.addEventListener && DESKTOP.addEventListener('change', function () { closePanel(true); openFilterGroups(); });

  /* ── Where the visitor roughly is ─────────────────────────────────────────
     The routes worker answers /geo from Cloudflare's own IP lookup (city,
     state, coordinates, time zone) — no third party, nothing stored, never
     asks permission. Fetched once a session, after the page is up, so it
     adds nothing to loading. Until it answers, or if it can't, everything
     uses the theme's place (Theme settings → Bush Riding). */
  var geoP = null, geoNow = null;
  function geo() {
    if (geoP) return geoP;
    var api = (cfg('api') || 'https://map-api.bushriding.cc').replace(/\/$/, '');
    try {
      var c = JSON.parse(sessionStorage.getItem('alp-geo') || 'null');
      if (c && c.at && Date.now() - c.at < 6 * 60 * 60 * 1000) { geoNow = c.g; geoP = Promise.resolve(c.g); return geoP; }
    } catch (err) {}
    geoP = fetch(api + '/geo', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (g) {
        g = g && isFinite(g.lat) && isFinite(g.lon) ? g : null;
        geoNow = g;
        try { sessionStorage.setItem('alp-geo', JSON.stringify({ at: Date.now(), g: g })); } catch (err) {}
        return g;
      })
      .catch(function () { return null; });
    return geoP;
  }
  /* "Beerwah, QLD" — the state's short code in Australia, else the country. */
  function geoPlace(g) {
    if (!g || !g.city) return '';
    var tail = g.country === 'AU' ? g.region_code : (g.country || '');
    return g.city + (tail ? ', ' + tail : '');
  }
  function tzLabel(tz) {
    try {
      var part = new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date())
        .filter(function (x) { return x.type === 'timeZoneName'; })[0];
      return part ? part.value : '';
    } catch (err) { return ''; }
  }
  /* The visitor's place, time zone and weather replace the theme's. */
  function initGeo() {
    geo().then(function (g) {
      if (!g) return;
      var place = geoPlace(g);
      if (place) $$('[data-alp-place]').forEach(function (n) { n.textContent = place; });
      if (place) $$('[data-alp-near-label]').forEach(function (n) { n.textContent = ' · ' + g.city; });
      if (g.tz) {
        var h = header();
        if (h) h.setAttribute('data-alp-tz', g.tz);
        var lab = tzLabel(g.tz);
        if (lab) $$('[data-alp-tz-label]').forEach(function (n) { n.textContent = lab; });
        tickClock();
      }
    });
  }

  /* ── Local time and weather ── */
  function tickClock() {
    var tz = cfg('tz') || 'Australia/Brisbane';
    var txt;
    try {
      txt = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz });
    } catch (err) {
      txt = new Date().toLocaleTimeString('en-AU', { hour12: false });
    }
    $$('[data-alp-clock]').forEach(function (el) { if (el.textContent !== txt) el.textContent = txt; });
  }

  /* WMO weather codes → a word or two, in the design's lower-case style. */
  function wxWord(code) {
    if (code === 0) return 'clear';
    if (code <= 2) return 'some cloud';
    if (code === 3) return 'cloud';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storms';
    return '';
  }

  function paintWx(w) {
    if (!w) return;
    $$('[data-alp-wx-text]').forEach(function (el) {
      el.textContent = el.getAttribute('data-alp-wx-format') === 'dot'
        ? w.t + '° · ' + w.word
        : w.t + '° ' + w.word;
    });
    $$('[data-alp-wx-wrap]').forEach(function (el) { el.hidden = false; });
  }

  var wx = null;
  function initWeather() {
    if (!cfg('wx')) return;
    if (wx) { paintWx(wx); return; }
    /* The visitor's own weather when /geo knows where they are, else the
       theme's place. */
    geo().then(function (g) {
      var at = g ? g.lat.toFixed(2) + ',' + g.lon.toFixed(2) : cfg('wx');
      var key = 'alp-wx:' + at;
      try {
        var c = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (c && Date.now() - c.at < 20 * 60 * 1000) { wx = c.w; paintWx(wx); return; }
      } catch (err) {}
      var ll = at.split(',');
      fetch('https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(ll[0]) + '&longitude=' + encodeURIComponent(ll[1]) + '&current=temperature_2m,weather_code&timezone=auto')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.current) return;
          var word = wxWord(d.current.weather_code);
          if (!word) return;
          wx = { t: Math.round(d.current.temperature_2m), word: word };
          try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), w: wx })); } catch (err) {}
          paintWx(wx);
        })
        .catch(function () { /* no weather is shown */ });
    });
  }

  /* ── Deferred video ── */
  var videoIo = null;
  function playVideo(el) {
    if (!el.getAttribute('src')) {
      var src = el.getAttribute('data-alp-video');
      if (!src) return;
      el.setAttribute('src', src);
      el.load();
    }
    var p = el.play();
    if (p && p.catch) p.catch(function () {});
  }
  function initVideos() {
    var vids = $$('[data-alp-video]');
    if (!vids.length) return;
    if (!('IntersectionObserver' in window)) { vids.forEach(playVideo); return; }
    if (!videoIo) {
      videoIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { playVideo(en.target); videoIo.unobserve(en.target); } });
      }, { rootMargin: '200px' });
    }
    vids.forEach(function (v) { videoIo.observe(v); });
  }

  /* ── Cart ─────────────────────────────────────────────────────────────────
     Adds and changes go through Shopify's AJAX cart with the Section
     Rendering API, so the drawer comes back already rendered by Liquid —
     prices, currency and line properties are never formatted in JS. */
  function cartSections() {
    var ids = ['alpine-cart'];
    var page = $('[data-alp-cart-page]');
    if (page) {
      var sec = page.closest('.shopify-section');
      if (sec && sec.id) ids.push(sec.id.replace(/^shopify-section-/, ''));
    }
    return ids;
  }

  function applySections(sections) {
    if (!sections) return;
    var doc = new DOMParser();
    Object.keys(sections).forEach(function (id) {
      var html = sections[id];
      if (!html) return;
      var fresh = doc.parseFromString(html, 'text/html');
      if (id === 'alpine-cart') {
        var nb = $('[data-alp-cart-root] [data-alp-cart-body]', fresh);
        var ob = $('[data-alp-cart-root] [data-alp-cart-body]');
        if (nb && ob) ob.innerHTML = nb.innerHTML;
        var nt = $('#alp-cart-title', fresh), ot = $('#alp-cart-title');
        if (nt && ot) ot.textContent = nt.textContent;
        var ns = $('[data-alp-subtotal]', fresh), os = $('[data-alp-subtotal]');
        if (ns && os) os.textContent = ns.textContent;
        var root = $('[data-alp-cart-root]', fresh);
        if (root) {
          var n = root.getAttribute('data-alp-cart-count-value');
          $$('[data-alp-cart-count]').forEach(function (el) { el.textContent = n; });
        }
      } else {
        var target = document.getElementById('shopify-section-' + id);
        var src = fresh.getElementById('shopify-section-' + id);
        if (target && src) target.innerHTML = src.innerHTML;
      }
    });
  }

  function post(url, body) {
    return fetch(ROOT.replace(/\/$/, '') + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error((d && (d.description || d.message)) || 'That didn’t work. Try again?');
        return d;
      });
    });
  }

  function addToCart(id) {
    return post('/cart/add.js', {
      items: [{ id: Number(id), quantity: 1 }],
      sections: cartSections().join(','),
      sections_url: window.location.pathname
    }).then(function (d) {
      applySections(d.sections);
      document.dispatchEvent(new CustomEvent('alp:cart-added', { detail: d }));
      return d;
    });
  }

  /* After an add: the drawer on desktop (D07), the Added sheet on a phone (M06b). */
  function showAdded(info) {
    if (DESKTOP.matches) { openPanel('alp-cart'); return; }
    var sheet = $('#alp-added');
    if (!sheet) { openPanel('alp-cart'); return; }
    var img = $('[data-alp-a-img]', sheet);
    if (img) {
      if (info.image) { img.src = info.image; img.hidden = false; } else { img.hidden = true; }
    }
    var t = $('[data-alp-a-title]', sheet); if (t) t.textContent = info.title || '';
    var m = $('[data-alp-a-meta]', sheet);
    if (m) m.textContent = [info.size ? 'Size ' + info.size : '', info.price || ''].filter(Boolean).join(' · ');
    openPanel('alp-added');
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-alp-line]');
    if (!a) return;
    e.preventDefault();
    var body = a.closest('[data-alp-cart-body]');
    if (body) body.classList.add('is-busy');
    post('/cart/change.js', {
      id: a.getAttribute('data-alp-line'),
      quantity: Number(a.getAttribute('data-alp-qty')),
      sections: cartSections().join(','),
      sections_url: window.location.pathname
    }).then(function (d) { applySections(d.sections); })
      .catch(function (err) { toast(err.message); })
      .then(function () { $$('[data-alp-cart-body]').forEach(function (b) { b.classList.remove('is-busy'); }); });
  });

  /* ── Email signups (newsletter, Notify me) ───────────────────────────────
     Every signup form posts into one hidden iframe, so the page itself never
     reloads or moves. That matters because Shopify injects its own bot-
     protection script that listens for these submits, adds a captcha token
     and re-submits the form natively — a fetch() of our own would race it
     (ours fails without the token, then Shopify's reload throws the visitor
     to the footer). Targeting an iframe works WITH that script: however the
     form is submitted, the response lands in the frame, and we read the
     result from there and answer in the form that was used.
     A real captcha challenge can't be solved in a hidden frame, so that one
     case falls back to an ordinary submit. */
  var sinkName = 'alp-signup-sink';
  var pendingSignup = null;

  function signupSink() {
    var f = document.querySelector('iframe[name="' + sinkName + '"]');
    if (f) return f;
    f = document.createElement('iframe');
    f.name = sinkName;
    f.title = 'Signup';
    f.tabIndex = -1;
    f.setAttribute('aria-hidden', 'true');
    /* Fixed in the corner, not at the foot of the page: Shopify redirects back
       to "#<form id>", and Chrome scrolls the parent page to reveal a fragment
       inside a same-origin frame. A frame that's always on screen gives it
       nothing to scroll to. */
    f.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    f.addEventListener('load', onSignupLoad);
    document.body.appendChild(f);
    return f;
  }

  function initSignups() {
    var forms = $$('[data-alp-signup]');
    if (!forms.length) return;
    signupSink();
    forms.forEach(function (form) { form.setAttribute('target', sinkName); });
  }

  function signupResult(form, ok) {
    var btn = $('button[type="submit"]', form);
    if (btn) btn.classList.remove('is-busy');
    if (ok) {
      $$('input:not([type="hidden"]), button, label', form).forEach(function (n) { n.hidden = true; });
      var msg = $('[data-alp-ok]', form);
      if (msg) msg.hidden = false;
    } else {
      var err = $('[data-alp-err]', form);
      if (err) err.hidden = false;
    }
  }

  function onSignupLoad() {
    var form = pendingSignup;
    if (!form) return;
    var frame = signupSink();
    var href = '', doc = null;
    try { href = frame.contentWindow.location.href; doc = frame.contentDocument; }
    catch (err) { pendingSignup = null; signupResult(form, true); return; } /* landed on another origin: Shopify accepted it and redirected */
    if (!href || href === 'about:blank') return;
    pendingSignup = null;

    if (/\/challenge/.test(href)) {
      form.removeAttribute('target');
      HTMLFormElement.prototype.submit.call(form);
      return;
    }
    var back = doc && form.id ? doc.getElementById(form.id) : null;
    var okBack = back && back.querySelector('[data-alp-ok]');
    var errBack = back && back.querySelector('[data-alp-err]');
    if (errBack && !errBack.hasAttribute('hidden')) { signupResult(form, false); return; }
    if ((okBack && !okBack.hasAttribute('hidden')) || /customer_posted=true/.test(href)) { signupResult(form, true); return; }
    signupResult(form, false);
  }

  /* Capture phase, and no preventDefault: the submit must go ahead (into the
     iframe) whichever script ends up sending it. */
  document.addEventListener('submit', function (e) {
    var form = e.target.closest && e.target.closest('[data-alp-signup]');
    if (!form) return;
    form.setAttribute('target', sinkName);
    signupSink();
    pendingSignup = form;
    var err = $('[data-alp-err]', form);
    if (err) err.hidden = true;
    var btn = $('button[type="submit"]', form);
    if (btn) btn.classList.add('is-busy');
  }, true);

  /* ── Product page buy block ──────────────────────────────────────────────
     Size tiles are radios; the variant id is resolved from all chosen
     options. Nothing is pre-chosen (size is a real decision) unless the URL
     names a variant. */
  function pdpState(form) {
    var variants = [];
    try { variants = JSON.parse($('[data-alp-variants]', form).textContent); } catch (err) {}
    var opts = $$('[data-alp-option]', form);
    var chosen = opts.map(function (fs) {
      var r = $('input:checked', fs);
      return r ? r.value : null;
    });
    var match = null;
    if (chosen.every(function (c) { return c !== null; })) {
      match = variants.filter(function (v) {
        return v.options.every(function (o, i) { return String(o) === String(chosen[i]); });
      })[0] || null;
    }
    return { variants: variants, opts: opts, chosen: chosen, match: match };
  }

  function syncPdp(form) {
    var s = pdpState(form);
    if (!s.opts.length) return s;
    var idInput = $('[data-alp-variant]', form);
    idInput.value = s.match && s.match.available ? s.match.id : '';

    /* Strike values that can't be bought with the other choices as they are. */
    s.opts.forEach(function (fs, i) {
      $$('input', fs).forEach(function (r) {
        var can = s.variants.some(function (v) {
          if (!v.available || String(v.options[i]) !== String(r.value)) return false;
          return s.chosen.every(function (c, j) { return j === i || c === null || String(v.options[j]) === String(c); });
        });
        r.disabled = !can;
        /* Sizes are .alp-tile, colours .alp-swatch — both get struck. */
        var box = r.closest('.alp-tile, .alp-swatch');
        if (box) box.classList.toggle('is-out', !can);
        if (!can && r.checked) r.checked = false;
      });
      var picked = $('input:checked', fs);
      var wrap = $('[data-alp-chosen-wrap]', fs);
      if (wrap) { wrap.hidden = !picked; $('[data-alp-chosen]', fs).textContent = picked ? picked.value : ''; }
    });

    var label = s.chosen.filter(Boolean).join(' / ');
    var addSize = $('[data-alp-add-size]', form);
    if (addSize) addSize.textContent = s.match ? ' · ' + label : '';
    var price = $('[data-alp-price]', form.closest('[data-alp-pdp]'));
    if (price && s.match) price.textContent = s.match.price;
    if (s.match) {
      form.classList.remove('is-need');
      var need = $('[data-alp-need]', form); if (need) need.hidden = true;
      if (window.history && history.replaceState && !DESIGN_MODE) {
        var u = new URL(window.location.href);
        u.searchParams.set('variant', s.match.id);
        history.replaceState(history.state, '', u.toString());
      }
    }
    return s;
  }

  /* Phone product page: the buy block sits in the page under the spec pills
     and docks to the bottom once the info column (down to Need help?) has
     scrolled off the top. A spacer holds its place so nothing jumps, and the
     page gets room under the footer only while it's docked. */
  var barObserved = null;
  function trackBuyBar() {
    var bar = $('.template-product [data-alp-buy]');
    var mark = $('.template-product [data-alp-buy-dock]');
    var slot = $('.template-product [data-alp-buy-slot]');
    if (!bar || !mark || bar === barObserved) return;
    barObserved = bar;
    var ticking = false;
    function room() {
      var on = bar.classList.contains('is-docked');
      document.body.style.setProperty('--alp-bar', on ? (bar.offsetHeight + 16) + 'px' : '0px');
    }
    function check() {
      ticking = false;
      if (!bar.isConnected) return;
      var dock = !DESKTOP.matches && mark.getBoundingClientRect().bottom < 0;
      if (dock === bar.classList.contains('is-docked')) return;
      if (slot) { slot.style.height = dock ? bar.offsetHeight + 'px' : ''; slot.style.display = dock ? 'block' : ''; }
      bar.classList.toggle('is-docked', dock);
      room();
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(check); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (window.ResizeObserver) new ResizeObserver(room).observe(bar);
    check();
  }

  function initPdp() {
    trackBuyBar();
    $$('[data-alp-buy]').forEach(function (form) {
      if (form._alp) return;
      form._alp = true;
      $('[data-alp-variant]', form).setAttribute('name', 'id');
      var want = new URLSearchParams(window.location.search).get('variant');
      var s = pdpState(form);
      if (want) {
        var v = s.variants.filter(function (x) { return String(x.id) === want; })[0];
        if (v && v.available) {
          s.opts.forEach(function (fs, i) {
            $$('input', fs).forEach(function (r) { if (String(r.value) === String(v.options[i])) r.checked = true; });
          });
        }
      }
      /* Colour starts on the first one in stock, so a shopper only has to
         pick a size — the size is the choice that matters. */
      var first = s.variants.filter(function (x) { return x.available; })[0];
      if (first) {
        s.opts.forEach(function (fs, i) {
          if (!fs.classList.contains('alp-buy__opt--colour') || $('input:checked', fs)) return;
          $$('input', fs).forEach(function (r) { if (String(r.value) === String(first.options[i])) r.checked = true; });
        });
      }
      syncPdp(form);
    });
  }

  document.addEventListener('change', function (e) {
    var form = e.target.closest('[data-alp-buy]');
    if (form) syncPdp(form);
  });

  /* Which button sent the form. e.submitter is missing on older iOS Safari
     and a tapped button isn't focused there, so note it on the tap itself. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-alp-buy] button[type="submit"]');
    if (b) b.form._alpBuyNow = b.hasAttribute('data-alp-buy-now');
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-alp-buy]');
    if (!form) return;
    e.preventDefault();
    var submitter = e.submitter;
    var buyNow = submitter && submitter.hasAttribute ? submitter.hasAttribute('data-alp-buy-now') : !!form._alpBuyNow;
    form._alpBuyNow = false;
    var s = syncPdp(form);
    var id = $('[data-alp-variant]', form).value;
    if (!id) {
      form.classList.remove('is-need'); void form.offsetWidth; form.classList.add('is-need');
      var need = $('[data-alp-need]', form);
      if (need) {
        /* Name the option still missing: "Choose a size first." */
        var missing = s.opts.filter(function (fs) { return !$('input:checked', fs); })[0];
        var nm = missing && $('.alp-buy__optname', missing);
        need.textContent = 'Choose a ' + (nm ? nm.textContent.trim().toLowerCase() : 'size') + ' first.';
        need.hidden = false;
      }
      var tiles = $('.alp-buy__tiles', form);
      if (tiles && DESKTOP.matches) tiles.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'center' });
      var first = $('.alp-tile input:not(:disabled)', form); if (first) first.focus({ preventScroll: true });
      return;
    }
    var btn = buyNow ? $('[data-alp-buy-now]', form) : $('[data-alp-add-btn]', form);
    if (btn) btn.classList.add('is-busy');
    addToCart(id)
      .then(function () {
        if (buyNow) { window.location.href = ROOT.replace(/\/$/, '') + '/checkout'; return; }
        var pdp = form.closest('[data-alp-pdp]');
        var title = pdp && $('.alp-pdp__title', pdp);
        var img = pdp && $('.alp-gal__slide:not([data-alp-clone]) img', pdp);
        showAdded({
          title: title ? title.textContent.trim() : '',
          image: img ? (img.currentSrc || img.src) : '',
          price: s.match ? s.match.price : '',
          size: s.chosen.filter(Boolean).join(' / ')
        });
      })
      .catch(function (err) { toast(err.message); })
      .then(function () { if (btn && !buyNow) btn.classList.remove('is-busy'); });
  });

  /* ── Filters: live "Show N results", autosubmit selects ── */
  function openFilterGroups() {
    $$('.alp-filters__group').forEach(function (d) { if (DESKTOP.matches) d.open = true; });
  }

  var countT = null;
  document.addEventListener('change', function (e) {
    var auto = e.target.closest('[data-alp-autosubmit]');
    if (auto) {
      var f = auto.form || auto.closest('form');
      if (f) { if (f.requestSubmit) f.requestSubmit(); else f.submit(); }
      return;
    }
    var form = e.target.closest('[data-alp-filter-form]');
    if (!form) return;
    clearTimeout(countT);
    countT = setTimeout(function () {
      var cat = form.closest('[data-alp-cat]');
      var btn = $('[data-alp-filter-submit]', form);
      if (!cat || !btn) return;
      var params = new URLSearchParams(new FormData(form));
      params.set('section_id', cat.getAttribute('data-alp-section'));
      fetch(form.action + '?' + params.toString(), { headers: { Accept: 'text/html' } })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (html) {
          if (!html) return;
          var m = html.match(/data-alp-count="(\d+)"/);
          if (!m) return;
          var n = Number(m[1]);
          btn.textContent = 'Show ' + n + ' ' + (n === 1 ? 'result' : 'results');
        })
        .catch(function () {});
    }, 250);
  });

  /* ── Routes and rides (the routes worker) ────────────────────────────────
     /routes and /events are public JSON with open CORS. Routes carry their
     full geometry, which nothing here needs, so it is dropped before the
     answer is cached for the session. */
  var feeds = {};
  function feed(name) {
    if (feeds[name]) return feeds[name];
    var api = (cfg('api') || 'https://map-api.bushriding.cc').replace(/\/$/, '');
    var key = 'alp-feed:' + api + '/' + name;
    try {
      var c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.at < 10 * 60 * 1000) { feeds[name] = Promise.resolve(c.list); return feeds[name]; }
    } catch (err) {}
    feeds[name] = fetch(api + '/' + name, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var list = ((d && d.features) || []).map(function (f) { return f.properties || {}; });
        try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), list: list })); } catch (err) {}
        return list;
      })
      .catch(function () { feeds[name] = null; return []; });
    return feeds[name];
  }

  function mapUrl() { return (cfg('map') || 'https://map.bushriding.cc').replace(/\/$/, ''); }
  function routeHref(id) { return mapUrl() + '/#' + encodeURIComponent(id); }
  function routeStats(p) {
    var bits = [];
    if (p.distance_km != null && p.distance_km !== '') bits.push(Math.round(Number(p.distance_km)).toLocaleString('en-AU') + ' km');
    if (p.elevation_gain_m != null && p.elevation_gain_m !== '') bits.push(Math.round(Number(p.elevation_gain_m)).toLocaleString('en-AU') + ' m');
    return bits.join(' · ');
  }
  /* Routes nearest the visitor first (each route's marker, as the crow
     flies) when /geo knows where they are; otherwise the theme's region. */
  function kmBetween(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 12742 * Math.asin(Math.sqrt(a));
  }
  function nearFirst(list, g) {
    if (!g) return regionFirst(list);
    var far = Infinity;
    return list.map(function (p) {
      var m = p.marker || [];
      var d = isFinite(m[0]) && isFinite(m[1]) ? kmBetween(g.lat, g.lon, Number(m[1]), Number(m[0])) : far;
      return { p: p, d: d };
    }).sort(function (a, b) { return a.d - b.d; }).map(function (x) { return x.p; });
  }
  function routesNear() {
    return Promise.all([feed('routes'), geo()]).then(function (res) { return nearFirst(res[0] || [], res[1]); });
  }
  function regionFirst(list) {
    var want = (cfg('region') || '').toLowerCase();
    if (!want) return list.slice();
    var near = [], rest = [];
    list.forEach(function (p) { ((p.region || '').toLowerCase().indexOf(want) > -1 ? near : rest).push(p); });
    return near.concat(rest);
  }
  function upcoming(list) {
    var today = new Date().toISOString().slice(0, 10);
    return list.filter(function (p) {
      if (!p.date_iso) return false;
      if (p.status && p.status !== 'upcoming') return false;
      return String(p.date_iso).slice(0, 10) >= today;
    }).sort(function (a, b) { return String(a.date_iso).localeCompare(String(b.date_iso)); });
  }
  function shortDate(iso) {
    /* Parse the date as a calendar day, not an instant, or it lands a day out
       west of UTC. */
    var d = String(iso).slice(0, 10).split('-');
    var dt = new Date(Date.UTC(+d[0], +d[1] - 1, +d[2], 12));
    return dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/,/g, '');
  }
  function rideHref(p) {
    return p.strava_url || (p.route_id ? routeHref(p.route_id) : mapUrl() + '/events/');
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Dropdown lists: two routes near you (Bush Map), the next three rides
     (Rides). Each fills once per page, from the cached feeds. */
  function ddRow(href, title, meta) {
    var a = el('a');
    a.href = href;
    a.appendChild(el('span', '', title));
    if (meta) a.appendChild(el('small', '', meta));
    return a;
  }
  var nearFilled = false;
  function fillNearList() {
    var box = $('[data-alp-near-list]');
    if (!box || nearFilled) return;
    nearFilled = true;
    routesNear().then(function (list) {
      var routes = list.slice(0, 2);
      box.innerHTML = '';
      routes.forEach(function (p) { box.appendChild(ddRow(routeHref(p.id), p.name, routeStats(p))); });
      if (!routes.length) { box.appendChild(el('span', 'alp-dd__quiet', 'Open the map to see every route.')); nearFilled = false; }
    });
  }
  var ridesFilled = false;
  function fillRidesList() {
    var box = $('[data-alp-rides-list]');
    if (!box || ridesFilled) return;
    ridesFilled = true;
    feed('events').then(function (list) {
      var rides = upcoming(list || []).slice(0, 3);
      box.innerHTML = '';
      rides.forEach(function (p) { box.appendChild(ddRow(rideHref(p), p.name || p.subtitle || 'Bush ride', shortDate(p.date_iso))); });
      if (!rides.length) { box.appendChild(el('span', 'alp-dd__quiet', 'Nothing on the calendar yet.')); ridesFilled = false; }
    });
  }

  /* D09 · M10 upcoming rides */
  function initRides() {
    $$('[data-alp-rides]').forEach(function (sec) {
      var list = $('[data-alp-ride-list]', sec);
      var tpl = $('[data-alp-ride-template]', sec);
      if (!list || !tpl || list.getAttribute('data-done')) return;
      list.setAttribute('data-done', '1');
      var photos = [];
      try { photos = JSON.parse($('[data-alp-ride-photos]', sec).textContent).filter(Boolean); } catch (err) {}
      var limit = Number(sec.getAttribute('data-alp-limit')) || 3;
      feed('events').then(function (all) {
        var rides = upcoming(all || []).slice(0, limit);
        if (!rides.length) { $('[data-alp-ride-none]', sec).hidden = false; return; }
        rides.forEach(function (p, i) {
          var card = tpl.content.firstElementChild.cloneNode(true);
          if (i === 0) card.classList.add('is-next');
          var link = $('[data-r-link]', card);
          link.href = p.route_id ? routeHref(p.route_id) : rideHref(p);
          var img = $('[data-r-img]', card);
          var src = p.hero_image || photos[i % (photos.length || 1)];
          if (src) { img.src = src; img.hidden = false; }
          $('[data-r-date]', card).textContent = shortDate(p.date_iso);
          $('[data-r-title]', card).textContent = p.name || p.subtitle || 'Bush ride';
          $('[data-r-meta]', card).textContent = [p.subtitle || p.route_name, p.time].filter(Boolean).join(' · ');
          var rsvp = $('[data-r-rsvp]', card);
          rsvp.href = rideHref(p);
          list.appendChild(card);
        });
      });
    });
  }

  /* M09 · route cards */
  function routeCard(tpl, p) {
    var card = tpl.content.firstElementChild.cloneNode(true);
    card.href = routeHref(p.id);
    var img = $('[data-r-img]', card);
    if (p.photo_url) { img.src = p.photo_url; img.hidden = false; }
    var region = $('[data-r-region]', card);
    if (p.region) region.textContent = p.region; else region.remove();
    $('[data-r-name]', card).textContent = p.name;
    $('[data-r-stats]', card).textContent = routeStats(p);
    return card;
  }
  function initRoutesPage() {
    $$('[data-alp-routes-page]').forEach(function (sec) {
      var list = $('[data-alp-route-list]', sec);
      var tpl = $('[data-alp-route-template]', sec);
      if (!list || !tpl || list.getAttribute('data-done')) return;
      list.setAttribute('data-done', '1');
      var limit = Number(sec.getAttribute('data-alp-limit')) || 6;
      routesNear().then(function (all) {
        var routes = all.slice(0, limit);
        if (!routes.length) { $('[data-alp-route-none]', sec).hidden = false; return; }
        routes.forEach(function (p) { list.appendChild(routeCard(tpl, p)); });
      });
    });
  }

  /* D06 · M07 search: routes and rides alongside Shopify's products */
  function hitRow(href, name, aside, asideLink) {
    var a = el('a', 'alp-hit');
    a.href = href;
    a.appendChild(el('span', 'alp-hit__name', name));
    a.appendChild(el('span', asideLink ? 'alp-hit__aside alp-hit__aside--link' : 'alp-hit__aside', aside));
    return a;
  }
  function popularCard(href, tag, flare, name, stats, img, mist) {
    var wrap = el('div', 'alp-card');
    var media = el('a', 'alp-card__media' + (mist ? ' alp-card__media--mist' : ''));
    media.href = href;
    /* Width/height give the browser the photo's 3:4 shape before it loads (the
       card already reserves it; this keeps Chrome's layout-shift check happy). */
    if (img) { var i = el('img', 'alp-fill'); i.src = img; i.alt = ''; i.width = 600; i.height = 800; i.loading = 'lazy'; i.decoding = 'async'; media.appendChild(i); }
    media.appendChild(el('span', 'alp-card__tag' + (flare ? ' alp-card__tag--flare' : ''), tag));
    var cap = el('p', 'alp-card__cap');
    var n = el('a', '', name); n.href = href; cap.appendChild(n);
    cap.appendChild(el('span', 'alp-card__stats', stats));
    wrap.appendChild(media); wrap.appendChild(cap);
    return wrap;
  }
  /* Most popular: after the product card(s), two routes and the next ride. */
  function fillPopular(grid) {
    if (!grid || grid.getAttribute('data-done')) return;
    grid.setAttribute('data-done', '1');
    Promise.all([routesNear(), feed('events')]).then(function (res) {
      res[0].slice(0, 2).forEach(function (p) {
        grid.appendChild(popularCard(routeHref(p.id), 'Route', false, p.name, routeStats(p), p.photo_url, true));
      });
      var r = upcoming(res[1] || [])[0];
      if (r) grid.appendChild(popularCard(rideHref(r), 'Ride', true, r.name || r.subtitle, shortDate(r.date_iso) + ' · RSVP', r.hero_image, false));
    });
  }

  function matchFeeds(q) {
    q = q.toLowerCase();
    function has(p, keys) {
      return keys.some(function (k) { return String(p[k] || '').toLowerCase().indexOf(q) > -1; });
    }
    return Promise.all([feed('routes'), feed('events')]).then(function (res) {
      return {
        routes: (res[0] || []).filter(function (p) { return has(p, ['name', 'region', 'state', 'description', 'series']); }),
        rides: upcoming(res[1] || []).filter(function (p) { return has(p, ['name', 'subtitle', 'route_name', 'meeting_point', 'description']); })
      };
    });
  }

  /* The header's search panel, as you type. */
  var lsT = null;
  var lsSeq = 0;
  document.addEventListener('input', function (e) {
    var field = e.target.closest('[data-alp-live-search]');
    if (!field) return;
    var panel = field.closest('[data-alp-panel]');
    var popular = $('[data-alp-ls-popular]', panel);
    var results = $('[data-alp-ls-results]', panel);
    var q = field.value.trim();
    clearTimeout(lsT);
    if (q.length < 2) { popular.hidden = false; results.hidden = true; return; }
    lsT = setTimeout(function () {
      var seq = ++lsSeq;
      var url = ROOT.replace(/\/$/, '') + '/search/suggest?q=' + encodeURIComponent(q) +
        '&resources[type]=product&resources[limit]=4&section_id=alpine-search-results';
      var products = fetch(url).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });
      Promise.all([products, matchFeeds(q)]).then(function (res) {
        if (seq !== lsSeq) return; /* a newer search has started */
        var doc = new DOMParser().parseFromString(res[0], 'text/html');
        var rows = $('[data-alp-ls-count]', doc);
        $('[data-alp-ls-products]', panel).innerHTML = rows ? rows.innerHTML : '<p class="alp-hit alp-hit--none">No products match.</p>';
        var rh = $('[data-alp-ls-routes]', panel), dh = $('[data-alp-ls-rides]', panel);
        rh.innerHTML = ''; dh.innerHTML = '';
        res[1].routes.slice(0, 5).forEach(function (p) { rh.appendChild(hitRow(routeHref(p.id), p.name, routeStats(p))); });
        res[1].rides.slice(0, 4).forEach(function (p) { dh.appendChild(hitRow(rideHref(p), shortDate(p.date_iso) + ' · ' + (p.subtitle || p.name), 'RSVP', true)); });
        if (!res[1].routes.length) rh.appendChild(el('p', 'alp-hit alp-hit--none', 'No routes match.'));
        if (!res[1].rides.length) dh.appendChild(el('p', 'alp-hit alp-hit--none', 'No rides match.'));
        popular.hidden = true; results.hidden = false;
      });
    }, 200);
  });

  function initSearch() {
    var sec = $('[data-alp-search]');
    if (!sec || sec.getAttribute('data-done')) return;
    sec.setAttribute('data-done', '1');
    var q = (sec.getAttribute('data-alp-q') || '').trim().toLowerCase();

    if (!q) { fillPopular($('[data-alp-popular]', sec)); return; }

    matchFeeds(q).then(function (m) {
      var routes = m.routes.slice(0, 8);
      var rides = m.rides.slice(0, 6);
      var rh = $('[data-alp-route-hits]', sec), dh = $('[data-alp-ride-hits]', sec);
      routes.forEach(function (p) { rh.appendChild(hitRow(routeHref(p.id), p.name, routeStats(p))); });
      rides.forEach(function (p) { dh.appendChild(hitRow(rideHref(p), shortDate(p.date_iso) + ' · ' + (p.subtitle || p.name), 'RSVP', true)); });
      $('[data-alp-count-routes]', sec).textContent = routes.length;
      $('[data-alp-count-rides]', sec).textContent = rides.length;
      $('[data-alp-group="routes"]', sec).hidden = !routes.length;
      $('[data-alp-group="rides"]', sec).hidden = !rides.length;
      sec.setAttribute('data-alp-routes-n', routes.length);
      sec.setAttribute('data-alp-rides-n', rides.length);
    });
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-alp-filter]');
    if (!chip) return;
    var sec = chip.closest('[data-alp-search]');
    var want = chip.getAttribute('data-alp-filter');
    $$('[data-alp-filter]', sec).forEach(function (c) {
      var on = c === chip;
      c.classList.toggle('is-on', on);
      c.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('[data-alp-group]', sec).forEach(function (g) {
      var name = g.getAttribute('data-alp-group');
      var n = name === 'products' ? 1 : Number(sec.getAttribute('data-alp-' + name + '-n') || 0);
      g.hidden = want === 'all' ? (name !== 'products' && !n) : name !== want;
    });
  });

  /* ── Product page: carousels, units, complementary row ── */
  /* The product carousel loops: a copy of the last photo sits before the
     first and a copy of the first after the last. Landing on a copy jumps,
     without animation, to the real photo it copies — so right from the last
     photo carries on to the first, and left from the first to the last. */
  function galLoop(sc) {
    var track = $('[data-alp-track]', sc);
    var slides = $$('.alp-gal__slide', track);
    if (slides.length < 2) return;
    var head = slides[slides.length - 1].cloneNode(true), tail = slides[0].cloneNode(true);
    [head, tail].forEach(function (c) { c.setAttribute('aria-hidden', 'true'); c.setAttribute('data-alp-clone', ''); $$('img', c).forEach(function (i) { i.loading = 'eager'; }); });
    track.insertBefore(head, slides[0]);
    track.appendChild(tail);
    sc._loop = slides.length;
    jumpTo(track, 1);
    var settle = null;
    track.addEventListener('scroll', function () {
      clearTimeout(settle);
      settle = setTimeout(function () { loopSettle(sc); }, 120);
    }, { passive: true });
    window.addEventListener('resize', function () { jumpTo(track, sc._at || 1); });
  }
  function jumpTo(track, i) {
    var keep = track.style.scrollBehavior, keepSnap = track.style.scrollSnapType;
    track.style.scrollBehavior = 'auto';
    track.style.scrollSnapType = 'none';
    track.scrollLeft = i * track.clientWidth;
    void track.offsetWidth;
    track.style.scrollSnapType = keepSnap;
    track.style.scrollBehavior = keep;
  }
  function loopSettle(sc) {
    var track = $('[data-alp-track]', sc), n = sc._loop;
    if (!track || !n || !track.clientWidth) return;
    var i = Math.round(track.scrollLeft / track.clientWidth);
    if (i <= 0) jumpTo(track, n);
    else if (i >= n + 1) jumpTo(track, 1);
  }

  function scrollerState(sc) {
    var track = $('[data-alp-track]', sc);
    if (!track) return;
    if (sc._loop) {
      var n0 = sc._loop, w = track.clientWidth || 1;
      var at = Math.round(track.scrollLeft / w);
      sc._at = Math.min(Math.max(at, 1), n0);
      var real = ((at - 1) % n0 + n0) % n0 + 1;
      var cn = $('[data-alp-slide-n]', sc);
      if (cn) cn.textContent = real;
      return; // looping: the arrows never run out
    }
    var max = track.scrollWidth - track.clientWidth - 2;
    var prev = $('[data-alp-scroll="-1"]', sc), next = $('[data-alp-scroll="1"]', sc);
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = track.scrollLeft >= max;
    var n = $('[data-alp-slide-n]', sc);
    if (n && track.clientWidth) n.textContent = Math.round(track.scrollLeft / track.clientWidth) + 1;
  }
  function initScrollers() {
    $$('[data-alp-scroller]').forEach(function (sc) {
      var track = $('[data-alp-track]', sc);
      if (!track || track._alp) return;
      track._alp = true;
      if (sc.classList.contains('alp-gal')) galLoop(sc);
      track.addEventListener('scroll', function () { scrollerState(sc); }, { passive: true });
      scrollerState(sc);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-alp-scroll]');
    if (!b) return;
    var sc = b.closest('[data-alp-scroller]');
    var track = sc && $('[data-alp-track]', sc);
    if (!track) return;
    /* A gallery moves one photo; a product row moves a screenful less one card. */
    var step = sc.classList.contains('alp-row') ? track.clientWidth * 0.75 : track.clientWidth;
    if (sc._loop) {
      /* Sitting on a copy (a fast second click before the jump)? Hop to the
         real photo first so the loop never hits the end of the track. */
      loopSettle(sc);
      var at = Math.round(track.scrollLeft / track.clientWidth) + Number(b.getAttribute('data-alp-scroll'));
      track.scrollTo({ left: at * track.clientWidth, behavior: REDUCE ? 'auto' : 'smooth' });
      return;
    }
    track.scrollBy({ left: Number(b.getAttribute('data-alp-scroll')) * step, behavior: REDUCE ? 'auto' : 'smooth' });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var track = e.target.closest && e.target.closest('.alp-gal [data-alp-track]');
    if (!track) return;
    var gsc = track.closest('[data-alp-scroller]');
    if (gsc && gsc._loop) loopSettle(gsc);
    track.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * track.clientWidth, behavior: REDUCE ? 'auto' : 'smooth' });
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-alp-unit]');
    if (!b) return;
    var box = b.closest('[data-alp-temp]');
    var f = b.getAttribute('data-alp-unit') === 'f';
    $$('[data-alp-unit]', box).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    $$('[data-c]', box).forEach(function (t) {
      var c = Number(t.getAttribute('data-c'));
      t.textContent = f ? Math.round(c * 9 / 5 + 32) + '°F' : c + '°C';
    });
  });

  /* "Ride-tested on" tile (product page). custom.route may hold the route id
     or a link to it (map …/#id, or a route page …/routes/qld/somerset/id/), so
     a pasted URL works as well as a typed id. Labels match the map and the
     generated route pages (scripts/generate-route-pages.js). */
  var STATE_FULL = { QLD: 'Queensland', NSW: 'New South Wales', VIC: 'Victoria', TAS: 'Tasmania', SA: 'South Australia', WA: 'Western Australia', NT: 'Northern Territory', ACT: 'Australian Capital Territory' };
  var TERRAIN = { groomed: 'Groomed', rocky: 'Rocky', 'proper-mud': 'Proper Mud', easy: 'Groomed', moderate: 'Rocky', hard: 'Proper Mud' };
  function slugify(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function routeIdFrom(ref) {
    ref = String(ref || '').trim();
    var h = ref.match(/#([^#?\/]+)\s*$/);
    if (h) return decodeURIComponent(h[1]);
    var parts = ref.replace(/[?#].*$/, '').split('/').filter(Boolean);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : '';
  }
  function effortOf(d, e) {
    d = Number(d); e = Number(e);
    if (d > 120 && e > 750) return 'Character building';
    if (d >= 75 || e > 750) return 'Big day out';
    return 'Cruisy';
  }
  /* Elevation profile from the route's GPX: distance along the track against
     elevation, as a filled line. Drawn only when the file carries <ele>. */
  function elevSvg(xml) {
    var re = /<trkpt[^>]*\blat="([-0-9.]+)"[^>]*\blon="([-0-9.]+)"[^>]*>(?:[\s\S]*?<ele>([-0-9.]+)<\/ele>)?/g, m, pts = [], d = 0, prev = null;
    while ((m = re.exec(xml))) {
      var p = { lat: +m[1], lon: +m[2] };
      if (prev) {
        var r = Math.PI / 180, dLat = (p.lat - prev.lat) * r, dLon = (p.lon - prev.lon) * r;
        var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(prev.lat * r) * Math.cos(p.lat * r) * Math.pow(Math.sin(dLon / 2), 2);
        d += 2 * 6371 * Math.asin(Math.sqrt(a));
      }
      prev = p;
      if (m[3] !== undefined) pts.push({ d: d, e: +m[3] });
    }
    if (pts.length < 2) return '';
    var step = Math.max(1, Math.floor(pts.length / 120)), prof = [];
    for (var i = 0; i < pts.length; i += step) {
      // Average each window — raw GPS elevation is jagged.
      var w = pts.slice(i, i + step), s = 0;
      w.forEach(function (q) { s += q.e; });
      prof.push({ d: w[0].d, e: s / w.length });
    }
    prof.push(pts[pts.length - 1]);
    var W = 400, H = 90, top = 6, dMax = prof[prof.length - 1].d || 1;
    var es = prof.map(function (q) { return q.e; });
    var lo = Math.min.apply(null, es), hi = Math.max.apply(null, es);
    if (hi - lo < 10) hi = lo + 10;
    var seq = prof.map(function (q) {
      return (q.d / dMax * W).toFixed(1) + ',' + (H - (q.e - lo) / (hi - lo) * (H - top)).toFixed(1);
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<path class="alp-ridetile__area" d="M0,' + H + ' L' + seq.join(' L') + ' L' + W + ',' + H + ' Z"/>' +
      '<path class="alp-ridetile__line" d="M' + seq.join(' L') + '" vector-effect="non-scaling-stroke"/></svg>';
  }
  function initRideTiles() {
    $$('[data-alp-ridetile]').forEach(function (tile) {
      if (tile._alp) return;
      tile._alp = true;
      var ref = tile.getAttribute('data-alp-ridetile');
      var id = routeIdFrom(ref);
      if (!id) return;
      feed('routes').then(function (list) {
        /* The id first, then — so a typed route name works too — a name match. */
        var want = id.toLowerCase(), wantSlug = slugify(ref);
        var p = (list || []).filter(function (x) { return String(x.id || '').toLowerCase() === want; })[0] ||
                (list || []).filter(function (x) { return slugify(x.name) === wantSlug || slugify(x.name) === slugify(id); })[0];
        if (p) id = p.id;
        if (!p) {
          /* Unknown or unpublished route: hidden for shoppers. In the theme
             editor the tile says why, so a typo isn't a silent failure. */
          if (window.console) console.warn('[alp] Ride-tested tile: no published Bush Map route matches "' + ref + '" (' + (list || []).length + ' routes loaded).');
          if (window.Shopify && Shopify.designMode) {
            tile.innerHTML = '<p class="alp-ridetile__eyebrow">Ride-tested on</p><p class="alp-ridetile__meta">No published Bush Map route matches \u201c' + String(ref).replace(/[<&]/g, '') + '\u201d' + ((list || []).length ? '' : ' (the routes feed returned nothing)') + '. Use the id at the end of the route page link. Shoppers see nothing here until it matches.</p>';
            tile.hidden = false;
          }
          return;
        }
        var state = String(p.state || '').trim().toUpperCase(), region = String(p.region || '').trim();
        var sm = !state && region.match(/,\s*([A-Za-z]{2,3})\s*$/);
        if (sm) { state = sm[1].toUpperCase(); region = region.replace(/,\s*[A-Za-z]{2,3}\s*$/, ''); }
        var place = [region, STATE_FULL[state] || state].filter(Boolean).join(', ');
        var terrain = TERRAIN[String(p.terrain_difficulty || '').toLowerCase()] || '';
        var meta = [place, effortOf(p.distance_km, p.elevation_gain_m), terrain].filter(Boolean).join(' · ');
        $('[data-alp-rt-name]', tile).textContent = p.name || '';
        $('[data-alp-rt-meta]', tile).textContent = meta;
        var dist = $('[data-alp-rt-dist]', tile), climb = $('[data-alp-rt-climb]', tile);
        if (p.distance_km != null && p.distance_km !== '') dist.textContent = Math.round(+p.distance_km).toLocaleString('en-AU') + ' km';
        else $('[data-alp-rt-dist-box]', tile).remove();
        if (p.elevation_gain_m != null && p.elevation_gain_m !== '') climb.textContent = Math.round(+p.elevation_gain_m).toLocaleString('en-AU') + ' m';
        else $('[data-alp-rt-climb-box]', tile).remove();
        // "Get the route" opens it on the map; GPX goes to its route page,
        // where the download sits behind the map's email gate as usual.
        $('[data-alp-rt-link]', tile).href = routeHref(id);
        $('[data-alp-rt-gpx]', tile).href = mapUrl() + '/routes/' + (slugify(state) || 'au') + '/' + (slugify(region) || 'other') + '/' + encodeURIComponent(id) + '/';
        tile.hidden = false;
        if (p.gpx_url) {
          fetch(p.gpx_url).then(function (r) { return r.ok ? r.text() : ''; }).then(function (xml) {
            var svg = xml && elevSvg(xml);
            if (svg) $('[data-alp-rt-elev]', tile).innerHTML = svg;
          }).catch(function () {});
        }
      });
    });
  }

  function initRecs() {
    $$('[data-alp-recs]').forEach(function (row) {
      if (row._alp) return;
      row._alp = true;
      fetch(row.getAttribute('data-alp-recs'))
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var box = $('[data-alp-recs-cards]', doc);
          if (!box || !box.children.length) return;
          var track = $('[data-alp-track]', row);
          track.innerHTML = box.innerHTML;
          row.hidden = false;
          scrollerState(row);
        })
        .catch(function () {});
    });
  }

  /* ── Header: slides away on the way down, back the moment you scroll up.
     Every page, phones and desktop. Never while one of its panels is open,
     never near the top of the page, and never in the theme editor. (On
     collection pages the category/filter bar stays pinned under it — CSS.) */
  var lastY = window.scrollY || 0;
  function headerScroll() {
    if (DESIGN_MODE) return;
    var y = window.scrollY || 0;
    var dy = y - lastY;
    lastY = y;
    var hidden = document.body.classList.contains('alp-hd-away');
    var panelOpen = openId && document.getElementById(openId) && document.getElementById(openId).closest('[data-alp-header]');
    if (panelOpen || y < 120) { if (hidden) document.body.classList.remove('alp-hd-away'); return; }
    if (dy > 6 && !hidden) document.body.classList.add('alp-hd-away');
    else if (dy < -6 && hidden) document.body.classList.remove('alp-hd-away');
  }
  window.addEventListener('scroll', headerScroll, { passive: true });

  /* ── Header over the opening photo: clear until the photo has gone up
     behind it, then the bone bar (body.alp-hd-solid). The clear look itself
     is CSS (alpine.css), so there's no flash before this runs. */
  var HERO_SEL = '.alp-hero, .alp-cat > .alp-intro:not(.alp-intro--plain)';
  var heroTick = false;
  /* Same test as the script at the end of <main> (layout/theme.liquid), run
     again when the theme editor adds, moves or removes a section. */
  function heroMark() {
    var m = document.getElementById('MainContent');
    $$('.alp-hd-under').forEach(function (x) { x.classList.remove('alp-hd-under'); });
    document.body.classList.remove('alp-hd-over');
    var h = m && $(HERO_SEL, m);
    if (!h || h.getBoundingClientRect().top - m.getBoundingClientRect().top > 4) return;
    (h.closest('.shopify-section') || h).classList.add('alp-hd-under');
    document.body.classList.add('alp-hd-over');
  }
  function heroHeader() {
    heroTick = false;
    var hero = document.body.classList.contains('alp-hd-over') && $('.alp-hd-under') && ($('.alp-hd-under').matches(HERO_SEL) ? $('.alp-hd-under') : $(HERO_SEL, $('.alp-hd-under')));
    var bar = $('.alp-hd__bar');
    if (!hero || !bar) { document.body.classList.remove('alp-hd-solid'); return; }
    var past = hero.getBoundingClientRect().bottom <= bar.getBoundingClientRect().bottom + 1;
    document.body.classList.toggle('alp-hd-solid', past);
  }
  function onHeroScroll() { if (!heroTick) { heroTick = true; requestAnimationFrame(heroHeader); } }
  window.addEventListener('scroll', onHeroScroll, { passive: true });
  window.addEventListener('resize', onHeroScroll);
  ['shopify:section:load', 'shopify:section:unload', 'shopify:section:reorder'].forEach(function (e) {
    document.addEventListener(e, function () { setTimeout(function () { heroMark(); heroHeader(); }, 0); });
  });
  heroHeader();
  /* The mouse alone never changes the bar — only an open menu does
     (body.alp-hd-open). Keyboard focus in the bar still brings the bone bar
     back, so a focus ring is never bone on a photo. */
  function kbFocus(el) {
    try { return !!(el && el.closest && el.closest('.alp-hd__bar') && el.matches(':focus-visible')); } catch (err) { return false; }
  }
  document.addEventListener('focusin', function (e) { if (kbFocus(e.target)) document.body.classList.add('alp-hd-hot'); });
  document.addEventListener('focusout', function (e) {
    if (kbFocus(e.target) && !kbFocus(e.relatedTarget)) document.body.classList.remove('alp-hd-hot');
  });

  /* Menus open whole: once the page has loaded, their photos are fetched
     and the route / ride lists filled ahead of the first hover. */
  function warmMenus() {
    $$('.alp-mega img[loading="lazy"]').forEach(function (img) { img.setAttribute('loading', 'eager'); });
    fillNearList();
    fillRidesList();
  }
  window.addEventListener('load', function () {
    (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(warmMenus);
  });

  /* ── Boot ── */
  /* ── Trademarks ──────────────────────────────────────────────────────────
     Every ™ is set small and raised (.alp-tm). Bush Riding, Bush Map and
     DustGrid always carry ™ — in the theme's own
     words and in anything typed into Shopify (product titles, descriptions,
     journal posts, collection names). A name already followed by ™ or ® is
     left alone, so nothing doubles. Lower-case "bush riding" is the
     activity, not the brand, so it's left as written. Text only: not attributes, form fields,
     scripts, or the editable bits of the theme editor's own UI. */
  var TM_NAME = 'Bush Riding|BUSH RIDING|Bush Map|BUSH MAP|DustGrid|DUSTGRID';
  /* A brand name (maybe with its ™/® already), or a ™ on its own. */
  var TM_ANY = new RegExp('\\b(' + TM_NAME + ')(?![A-Za-z])([\u2122\u00AE]?)|\u2122', 'g');
  var TM_SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, NOSCRIPT: 1, TITLE: 1, CODE: 1, PRE: 1 };
  function tmSpan() { var t = document.createElement('span'); t.className = 'alp-tm'; t.textContent = '\u2122'; return t; }
  /* Rewrites one text node into text + small ™ spans. Returns false when the
     node needs nothing (so it's left untouched — this is what keeps it from
     looping: a name already followed by its .alp-tm span is skipped). */
  function tmNode(n) {
    var text = n.nodeValue, out = [], last = 0, changed = false, m;
    TM_ANY.lastIndex = 0;
    while ((m = TM_ANY.exec(text))) {
      var end = TM_ANY.lastIndex;
      if (m[1]) {
        if (m[2] === '\u00AE') continue;
        var atEnd = end === text.length && !m[2];
        var next = n.nextSibling;
        if (!m[2] && atEnd && next && next.nodeType === 1 && next.classList && next.classList.contains('alp-tm')) continue;
        out.push(text.slice(last, m.index + m[1].length), tmSpan());
      } else {
        out.push(text.slice(last, m.index), tmSpan());
      }
      last = end; changed = true;
    }
    if (!changed) return false;
    out.push(text.slice(last));
    /* One wrapper for the lot, so a flex row (the phone menu) can't push the
       name and its ™ apart as separate items. */
    var wrap = document.createElement('span');
    wrap.className = 'alp-tmw';
    out.forEach(function (x) { if (typeof x === 'string') { if (x) wrap.appendChild(document.createTextNode(x)); } else wrap.appendChild(x); });
    n.parentNode.replaceChild(wrap, n);
    return true;
  }
  function trademark(root) {
    if (!root || !document.createTreeWalker) return;
    if (root.nodeType === 1 && root.classList && root.classList.contains('alp-tm')) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || TM_SKIP[p.nodeName] || (p.closest && p.closest('[contenteditable], [data-alp-no-tm], .alp-tm'))) return NodeFilter.FILTER_REJECT;
        TM_ANY.lastIndex = 0;
        return TM_ANY.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode);
    hits.forEach(tmNode);
  }
  /* Menus, search results and the cart fill in after load; catch those too.
     Our own rewrites add nodes too; they come back here once and are left
     alone (see tmNode), so it settles after one pass. */
  if (window.MutationObserver) {
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === 1) trademark(n);
          else if (n.nodeType === 3 && n.parentNode) trademark(n.parentNode);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* Bottom sheets that close on a downward swipe (the phone menu). Only from
     the top of the sheet's scroll, so scrolling its list still works. */
  (function () {
    var y0 = null, dy = 0, sheet = null;
    document.addEventListener('touchstart', function (e) {
      sheet = e.target.closest && e.target.closest('[data-alp-swipe-close].is-open');
      if (!sheet || sheet.scrollTop > 0) { sheet = null; return; }
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!sheet || y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 0) { sheet.classList.add('is-dragging'); sheet.style.transform = 'translateY(' + dy + 'px)'; }
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (!sheet) return;
      sheet.classList.remove('is-dragging'); sheet.style.transform = '';
      if (dy > 90) closePanel();
      sheet = null; y0 = null; dy = 0;
    });
  })();

  /* ── Product photos full screen (phones) ─────────────────────────────────
     Tapping a gallery photo opens every photo full screen, swipeable, at the
     one tapped; ✕, Escape or the back gesture's tap on the page closes. */
  document.addEventListener('click', function (e) {
    if (DESKTOP.matches) return;
    var img = e.target.closest && e.target.closest('.alp-gal__slide img');
    if (!img) return;
    var track = img.closest('[data-alp-track]');
    var imgs = $$('.alp-gal__slide:not([data-alp-clone]) img', track);
    /* Open at the photo the carousel shows (its counter covers the loop's copies). */
    var nEl = $('[data-alp-slide-n]', img.closest('[data-alp-scroller]'));
    var at = Math.min(imgs.length - 1, Math.max(0, (parseInt(nEl && nEl.textContent, 10) || 1) - 1));
    var box = el('div', 'alp-zoom');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photos');
    var t = el('div', 'alp-zoom__track');
    imgs.forEach(function (src) {
      var sl = el('div', 'alp-zoom__slide'), i = el('img');
      i.src = src.currentSrc || src.src; i.alt = src.alt || ''; sl.appendChild(i); t.appendChild(sl);
    });
    var count = el('p', 'alp-zoom__count', (at + 1) + ' / ' + imgs.length);
    var x = el('button', 'alp-zoom__close'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    box.appendChild(t); box.appendChild(count); box.appendChild(x);
    document.body.appendChild(box); lock();
    t.scrollLeft = at * t.clientWidth;
    t.addEventListener('scroll', function () { count.textContent = (Math.round(t.scrollLeft / (t.clientWidth || 1)) + 1) + ' / ' + imgs.length; }, { passive: true });
    function shut() { box.remove(); unlock(); document.removeEventListener('keydown', esc); img.focus && img.focus({ preventScroll: true }); }
    function esc(ev) { if (ev.key === 'Escape') shut(); }
    x.addEventListener('click', shut);
    document.addEventListener('keydown', esc);
    x.focus({ preventScroll: true });
  });

  /* ── Journal videos: show a still before play ────────────────────────────
     Videos placed in a blog post show a blank frame with a play button on
     iPhone until pressed. With no poster set, ask for the first frame: load
     metadata and point the source a hair past 0s, which makes Safari paint
     it. */
  function initArticleVideos() {
    $$('.alp-article__body video').forEach(function (v) {
      if (v._alp || v.getAttribute('poster')) return;
      v._alp = true;
      v.setAttribute('playsinline', '');
      v.preload = 'metadata';
      var bump = function (url) { return url && url.indexOf('#') < 0 ? url + '#t=0.001' : url; };
      if (v.getAttribute('src')) v.setAttribute('src', bump(v.getAttribute('src')));
      $$('source', v).forEach(function (so) { if (so.getAttribute('src')) so.setAttribute('src', bump(so.getAttribute('src'))); });
      try { v.load(); } catch (err) {}
    });
  }

  function init() {
    /* One failing block mustn't stop the rest of the page's script. */
    [function () { trademark(document.body); }, initArticleVideos, initSignups, initScrollers, initRecs, tickClock, initGeo, initWeather, initVideos, initPdp, initRideTiles,
     openFilterGroups, initRides, initRoutesPage, initSearch].forEach(function (fn) {
      try { fn(); } catch (err) { if (window.console) console.error('[alp] ' + (fn.name || 'init') + ' failed:', err); }
    });
  }

  init();
  setInterval(tickClock, 1000);

  document.addEventListener('shopify:section:load', function () {
    nearFilled = false;
    ridesFilled = false;
    closePanel(true);
    init();
  });
})();
