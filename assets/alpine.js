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
    /* Bush Map opens its panel on hover, but a click goes to the map. */
    if (toggle && toggle.hasAttribute('data-alp-follow') && DESKTOP.matches) { closePanel(true); return; }
    if (toggle) {
      e.preventDefault();
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

  /* Shop, Bush Map and Search open on hover (desktop) and stay open while the
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
      clearTimeout(hoverT);
      hoverT = setTimeout(function () {
        if (openId !== id) { hoverOpenedAt = Date.now(); openPanel(id, { focusFrom: btn }); }
      }, 120);
      return;
    }
    var open = openId && document.getElementById(openId);
    if (!open || !open.closest('[data-alp-header]') || openId === 'alp-menu') return;
    if (e.target.closest('[data-alp-header]')) { clearTimeout(hoverT); return; }
    if (openId === 'alp-searchmenu' && searchInUse()) return;
    clearTimeout(hoverT);
    hoverT = setTimeout(function () {
      if (openId === 'alp-searchmenu' && searchInUse()) return;
      if (openId && document.getElementById(openId).closest('[data-alp-header]')) closePanel(true);
    }, 280);
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
    hoverT = setTimeout(function () { closePanel(true); }, 280);
  });

  DESKTOP.addEventListener && DESKTOP.addEventListener('change', function () { closePanel(true); openFilterGroups(); });

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
    var at = cfg('wx');
    if (!at) return;
    if (wx) { paintWx(wx); return; }
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

  /* ── Quick add ───────────────────────────────────────────────────────────
     Desktop: a size in the card's hover strip adds it (tap 2), the drawer
     opens with Checkout (tap 3). Phone: Quick add + opens the size sheet
     (tap 1), a size adds it (tap 2), the Added sheet has Checkout (tap 3). */
  function cardData(card) {
    var s = card && $('[data-alp-card-data]', card);
    if (!s) return null;
    try { return JSON.parse(s.textContent); } catch (err) { return null; }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-alp-add]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    var card = btn.closest('[data-alp-card]');
    var data = cardData(card) || {};
    btn.classList.add('is-busy');
    addToCart(btn.getAttribute('data-alp-add'))
      .then(function () {
        var size = btn.getAttribute('data-alp-size') || (btn.textContent || '').trim();
        if (size === 'Add +' || size === 'Add') size = '';
        if (openId === 'alp-quick') closePanel(true);
        showAdded({ title: data.title, image: data.image, price: data.price, size: size });
      })
      .catch(function (err) { toast(err.message); })
      .then(function () { btn.classList.remove('is-busy'); });
  });

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-alp-quick]');
    if (!chip) return;
    e.preventDefault();
    var data = cardData(chip.closest('[data-alp-card]'));
    var sheet = $('#alp-quick');
    if (!data || !sheet) return;
    var img = $('[data-alp-q-img]', sheet);
    if (data.image) { img.src = data.image; img.hidden = false; } else { img.hidden = true; }
    $('[data-alp-q-title]', sheet).textContent = data.title;
    $('[data-alp-q-price]', sheet).textContent = data.price;
    var sizes = $('[data-alp-q-sizes]', sheet);
    sizes.innerHTML = '';
    data.variants.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'alp-sheet__size';
      b.textContent = v.title;
      b.setAttribute('data-alp-add', v.id);
      b.setAttribute('data-alp-size', v.title === 'Add' ? '' : v.title);
      b.setAttribute('aria-label', 'Add ' + data.title + (v.title === 'Add' ? '' : ', size ' + v.title));
      if (!v.available) { b.disabled = true; b.setAttribute('aria-label', v.title + ', sold out'); }
      sizes.appendChild(b);
    });
    /* The sheet's buttons live outside the card, so give it the card's data. */
    sheet.setAttribute('data-alp-card', '');
    var holder = $('[data-alp-card-data]', sheet);
    if (!holder) { holder = document.createElement('script'); holder.type = 'application/json'; holder.setAttribute('data-alp-card-data', ''); sheet.appendChild(holder); }
    holder.textContent = JSON.stringify(data);
    openPanel('alp-quick', { focusFrom: chip });
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
        r.closest('.alp-tile').classList.toggle('is-out', !can);
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

  function initPdp() {
    $$('[data-alp-buy]').forEach(function (form) {
      if (form._alp) return;
      form._alp = true;
      $('[data-alp-variant]', form).setAttribute('name', 'id');
      var want = new URLSearchParams(window.location.search).get('variant');
      if (want) {
        var s = pdpState(form);
        var v = s.variants.filter(function (x) { return String(x.id) === want; })[0];
        if (v && v.available) {
          s.opts.forEach(function (fs, i) {
            $$('input', fs).forEach(function (r) { if (String(r.value) === String(v.options[i])) r.checked = true; });
          });
        }
      }
      syncPdp(form);
    });
  }

  document.addEventListener('change', function (e) {
    var form = e.target.closest('[data-alp-buy]');
    if (form) syncPdp(form);
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('[data-alp-buy]');
    if (!form) return;
    e.preventDefault();
    var submitter = e.submitter || document.activeElement;
    var buyNow = !!(submitter && submitter.hasAttribute && submitter.hasAttribute('data-alp-buy-now'));
    var s = syncPdp(form);
    var id = $('[data-alp-variant]', form).value;
    if (!id) {
      form.classList.remove('is-need'); void form.offsetWidth; form.classList.add('is-need');
      var need = $('[data-alp-need]', form); if (need) need.hidden = false;
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
        var img = pdp && $('.alp-pdp__img img', pdp);
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

  /* D08 · NEAR YOU */
  var nearFilled = false;
  function fillNearList() {
    var ul = $('[data-alp-near-list]');
    if (!ul || nearFilled) return;
    nearFilled = true;
    Promise.all([feed('routes'), feed('events')]).then(function (res) {
      var routes = regionFirst(res[0] || []).slice(0, 2);
      var next = upcoming(res[1] || [])[0];
      ul.innerHTML = '';
      routes.forEach(function (p) {
        var li = el('li');
        var a = el('a', 'alp-list__row');
        a.href = routeHref(p.id);
        a.appendChild(el('span', '', p.name));
        a.appendChild(el('span', '', routeStats(p)));
        li.appendChild(a); ul.appendChild(li);
      });
      if (next) {
        var li = el('li');
        var a = el('a', 'alp-list__row');
        a.href = rideHref(next);
        a.appendChild(el('span', '', (next.name || 'Bush event') + ' · ' + shortDate(next.date_iso)));
        a.appendChild(el('span', '', 'RSVP'));
        li.appendChild(a); ul.appendChild(li);
      }
      if (!routes.length && !next) {
        ul.innerHTML = '';
        ul.appendChild(el('li', 'alp-list__row alp-list__row--quiet', 'Open the map to see every route.'));
        nearFilled = false;
      }
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
      feed('routes').then(function (all) {
        var routes = regionFirst(all || []).slice(0, limit);
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
    if (img) { var i = el('img', 'alp-fill'); i.src = img; i.alt = ''; i.loading = 'lazy'; media.appendChild(i); }
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
    Promise.all([feed('routes'), feed('events')]).then(function (res) {
      regionFirst(res[0] || []).slice(0, 2).forEach(function (p) {
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
  function scrollerState(sc) {
    var track = $('[data-alp-track]', sc);
    if (!track) return;
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
    track.scrollBy({ left: Number(b.getAttribute('data-alp-scroll')) * step, behavior: REDUCE ? 'auto' : 'smooth' });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var track = e.target.closest && e.target.closest('.alp-gal [data-alp-track]');
    if (!track) return;
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

  /* ── Boot ── */
  function init() {
    initSignups();
    initScrollers();
    initRecs();
    tickClock();
    initWeather();
    initVideos();
    initPdp();
    openFilterGroups();
    initRides();
    initRoutesPage();
    initSearch();
  }

  init();
  setInterval(tickClock, 1000);

  document.addEventListener('shopify:section:load', function () {
    nearFilled = false;
    closePanel(true);
    init();
  });
})();
