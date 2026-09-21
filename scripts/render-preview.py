#!/usr/bin/env python3
"""Render the theme's real CSS against representative markup and screenshot it.

    python3 scripts/render-preview.py /tmp/shots

Why this exists: the dev sandbox cannot reach bushriding.cc (the egress proxy
blocks it, and the preview theme is password-protected anyway), and there is no
Shopify CLI here to compile Liquid. That is not a reason to ship CSS unseen.
This loads assets/alpine.css against markup shaped like what the sections
actually output, and screenshots it in headless Chromium at desktop and phone
widths.

WHAT IT PROVES: layout. Overflow, stacking, spacing, contrast, and rules that
lose on specificity — the class of bug that kept reaching the preview. The
duplicated facet rail and the bleed wordmark running 196px off the page would
both have been obvious here.

WHAT IT DOES NOT PROVE: anything Liquid. A wrong conditional, a missing
metafield, a setting that never reaches the template — none of that shows up,
because the markup here is written by hand rather than rendered by Shopify.
Treat a clean run as "the CSS behaves", never as "the page works".

The brand faces are not reachable offline, so type falls back to system-ui and
the metrics are close but not exact. Judge layout here; judge type on the real
preview theme.
"""
import base64, io, os, pathlib, subprocess, sys

THEME = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots')
OUT.mkdir(parents=True, exist_ok=True)
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

CSS = (THEME / 'assets/alpine.css').read_text(encoding='utf-8')

def asset(name):
    """Inline a theme asset so file:// can see it."""
    p = THEME / 'assets' / name
    if not p.exists():
        return ''
    data = base64.b64encode(p.read_bytes()).decode()
    mime = 'image/svg+xml' if name.endswith('.svg') else 'image/jpeg'
    return f'data:{mime};base64,{data}'

# A bright sunset stand-in — the honest test for type-over-photography.
SUNSET = ("data:image/svg+xml;base64," + base64.b64encode(b'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#7d9dc4"/><stop offset="55%" stop-color="#c9c3bd"/>
<stop offset="80%" stop-color="#f6d2a8"/><stop offset="100%" stop-color="#fbe6c8"/>
</linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/></svg>''').decode())

WORDMARK = asset('wordmark-olive.svg')
MIST_MARK = asset('wordmark-mist.svg')

def rail(active, slot='', foot_variant='ride'):
    links = ''
    for name in ['Home', 'Shop', 'Journal', 'About', 'BUSH MAP™']:
        on = ' is-on' if name == active else ''
        links += f'<a class="alp-rail__link{on}" href="#">{name}</a>'
    if foot_variant == 'cart':
        foot = ('<span class="alp-nr__rule"></span>'
                '<p class="alp-rail__eyebrow">Cart</p>'
                '<p class="alp-rail__summary">2 items · $235</p>')
    else:
        foot = ('<div class="alp-nr alp-nr--rail">'
                '<span class="alp-nr__rule"></span>'
                '<p class="alp-nr__date">Next ride<br><span>Sunday 11th October, 7am</span></p>'
                '<p class="alp-nr__place"><span>Glass House Mountains Station Carpark</span><br>'
                '<span>Glass House to Woodford loop</span></p>'
                '<a class="alp-nr__link" href="#">Join the ride <span class="alp-glyph">✦</span></a></div>'
                '<a class="alp-rail__cart" href="#">Cart (0)</a>')
    return f'''<header class="alp alp-rail" data-alp-rail>
      <div class="alp-rail__top">
        <a class="alp-rail__wordmark" href="#"><img class="alp-rail__mark" src="{WORDMARK}" alt="Bush Riding"></a>
        <nav class="alp-rail__nav">{links}</nav>
        <form class="alp-search alp-search--rail" action="/search"><input class="alp-search__field"
          type="search" placeholder="Search the shop"><button class="alp-search__go" type="submit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button></form>
        <div class="alp-rail__slot" data-alp-rail-slot>{slot}</div>
      </div>
      <div class="alp-rail__foot">{foot}</div>
    </header>'''

def passage(ground, eyebrow, heading='', body='', cta='', size='large', ruled=False):
    cls = f'alp-passage alp-passage--{ground} alp-passage--{size}'
    if ruled:
        cls += ' alp-passage--ruled'
    h = f'<h2 class="alp-passage__heading">{heading}</h2>' if heading else ''
    b = f'<div class="alp-passage__body rte">{body}</div>' if body and ground != 'mist' else ''
    c = f'<a class="alp-chip alp-passage__cta" href="#">{cta}</a>' if cta else ''
    return (f'<div class="shopify-section"><section class="alp {cls}">'
            f'<p class="alp-passage__eyebrow">{eyebrow}</p>'
            f'<div class="alp-passage__field">{h}{b}{c}</div></section></div>')

def tile(height='medium', veil=False, eyebrow='', label='', frame='', headline=False):
    v = '<div class="alp-tile__veil"></div>' if veil else ''
    plate = ''
    if eyebrow or label or frame:
        lab = ''
        if label:
            sz = 'headline' if headline else 'label'
            lab = f'<p class="alp-tile__label alp-tile__label--{sz}">{label}</p>'
        eb = f'<p class="alp-tile__eyebrow">{eyebrow}</p>' if eyebrow else ''
        fr = f'<p class="alp-tile__eyebrow alp-tile__frame">{frame}</p>' if frame else ''
        plate = f'<div class="alp-tile__plate"><div class="alp-tile__plate-main">{eb}{lab}</div>{fr}</div>'
    return (f'<div class="shopify-section"><section class="alp alp-tile alp-tile--{height}">'
            f'<div class="alp-tile__media"><img src="{SUNSET}" alt=""></div>{v}{plate}</section></div>')

def top():
    return ('<button class="alp alp-top is-in" data-alp-top aria-label="Back to top">'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">'
            '<path d="M12 19V6"/><path d="M6 12l6-6 6 6"/></svg></button>')

def fab():
    return ('<div class="alp alp-fab" data-alp-fab>'
            '<button class="alp-chip alp-chip--flare alp-fab__btn">Menu <span class="alp-glyph">\u2726</span></button>'
            '<a class="alp-chip alp-fab__btn" href="#">Cart</a></div>')

def sheet(open_=True):
    rows = ''.join(f'<a class="alp-rail__link" href="#">{n}</a>'
                   for n in ['Home', 'Shop', 'Journal', 'About', 'BUSH MAP\u2122'])
    cards = ''.join(
        f'<a class="alp-sheet__card" href="#"><img class="alp-sheet__media" src="{SUNSET}" alt="">'
        f'<span class="alp-sheet__cardlabel">{lbl}</span></a>'
        for lbl in ['The launch', 'Latest dispatch'])
    cols = ('<div class="alp-sheet__col"><p class="alp-rail__eyebrow">The fine print</p>'
            '<ul><li><a href="#">Privacy policy</a></li><li><a href="#">Contact</a></li></ul></div>'
            '<div class="alp-sheet__col"><p class="alp-rail__eyebrow">Follow</p>'
            '<ul><li><a href="#">Instagram</a></li><li><a href="#">Strava</a></li></ul></div>')
    return (f'<div class="alp alp-sheet{" is-open" if open_ else ""}">'
            '<div class="alp-sheet__scrim"></div>'
            '<div class="alp-sheet__panel">'
            f'<div class="alp-sheet__bar"><img class="alp-sheet__mark" src="{WORDMARK}" alt="">'
            '<button class="alp-sheet__close">'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">'
            '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
            '<div class="alp-sheet__scroll">'
            '<form class="alp-search alp-search--sheet" action="/search"><input class="alp-search__field" '
            'type="search" placeholder="Search the shop"><button class="alp-search__go" type="submit">'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">'
            '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></button></form>'
            f'<nav class="alp-sheet__nav">{rows}<a class="alp-rail__cart" href="#">Cart (0)</a></nav>'
            '<a class="alp-nr alp-nr--panel" href="#"><span class="alp-nr__tab">Next ride</span>'
            '<span class="alp-nr__date">Sunday 11th October, 7am<br>Glass House Mountains Station Carpark</span>'
            '<span class="alp-chip alp-nr__cta">View on BUSH MAP\u2122 \u2192</span></a>'
            f'<div class="alp-sheet__cards">{cards}</div>'
            f'<div class="alp-sheet__columns">{cols}</div>'
            '</div></div></div>')

def buybar():
    return ('<div class="alp alp-buybar">'
            '<button class="alp-chip alp-chip--flare alp-buybar__go">'
            '<span>Add to cart</span><span class="alp-buybar__price">$180</span></button>'
            '<button class="alp-chip alp-buybar__menu">Menu <span class="alp-glyph">\u2726</span></button></div>')

def nextride_card(ground='mist'):
    return (f'<div class="shopify-section"><section class="alp alp-nrs alp-nrs--{ground} alp-nrs--phone">'
            '<a class="alp-nr alp-nr--card" href="#">'
            '<span class="alp-nr__head"><span class="alp-nr__eyebrow">Next ride</span>'
            '<span class="alp-nr__eyebrow">Free \u00b7 all welcome</span></span>'
            '<span class="alp-nr__date">Sunday 11th October, 7am \u2014 Glass House Mountains Station Carpark</span>'
            '<span class="alp-nr__note">62 km gravel, caf\u00e9 stop at nine.</span>'
            '<span class="alp-chip alp-nr__cta">View on BUSH MAP\u2122 \u2192</span></a></section></div>')

PAGES = {}

# ── About, as it now stands: both photographs clean, statement on bone ──
PAGES['about'] = (rail('About',
    '<p class="alp-rail__eyebrow">Sections</p>'
    + ''.join(f'<a class="alp-rail__detail" href="#">{s}</a>'
              for s in ['Made for the detour', 'The gear', 'The country', 'The drovers', 'The detour'])),
    tile('tall')
    + passage('bone', 'Made for the detour',
              'Bush Riding designs are made for riding a bike through the Australian Bush.')
    + passage('bone', 'The gear', '',
              "<p>We make gear for those who feel drawn to adventure and the unknown. Allowing for comfortable exploration in one of our planet's most unforgiving climates.</p><p>For those who embark on a journey through the Aussie bush, better come prepared.</p>")
    + passage('olive', 'The country', 'Our country is vast, breath-taking and at times, unforgiving.',
              '<p>For centuries, people traversed this land atop a saddle. Trusting their steed to confidently navigate the unforgiving terrain and arid climate.</p><p>Years spent droving, leaving behind the trails we still ride today.</p>')
    + tile('medium')
    + passage('bone', 'The drovers', '',
              "<p>We've swapped the steed for a steel frame and the drover's swag for a bar bag. We ride the same dirt, chase the same horizons, seek the same shelter.</p>")
    + passage('mist', 'The detour',
              "We ride for the detour ∧ the café stop ∧ the track that didn't make the map.",
              '', 'Ride with us ✦'), 'template-page')

# ── Catalogue: the facet-duplication fix has to hold ──
facets = ('<div class="alp-cat__facet"><h2 class="alp-cat__facet-head">Availability</h2>'
          '<ul class="alp-cat__facet-list"><li><a class="alp-cat__facet-link" href="#">Out of stock '
          '<span class="alp-cat__facet-count">1</span></a></li></ul></div>')
cards = ''.join(
    '<article class="alp-card alp-cat__card"><a href="#"><span class="alp-cat__card-media">'
    f'<img src="{SUNSET}" alt=""></span><span class="alp-cat__card-row">'
    '<span class="alp-cat__card-name">Bush Riding Shorts</span>'
    '<span class="alp-cat__card-price">$180</span></span></a></article>' for _ in range(3))

PAGES['collection'] = (rail('Shop', facets),
    '<section class="alp alp-cat">'
    '<div class="alp-cat__banner alp-cat__banner--short">'
    f'<img src="{SUNSET}" alt="">'
    '<div class="alp-cat__banner-overlay"><p class="alp-cat__eyebrow">November launch</p>'
    '<h1 class="alp-cat__title">Products</h1></div></div>'
    '<div class="alp-cat__rule"></div>'
    '<div class="alp-cat__intro"><p class="alp-cat__intro-eyebrow">The launch</p>'
    '<div class="alp-cat__intro-body"><p>Eight pieces. Designed in Australia, made for the detour.</p></div></div>'
    '<div class="alp-cat__body">'
    f'<aside class="alp-cat__side">{facets}</aside>'
    '<div class="alp-cat__main"><div class="alp-cat__toolbar"><p class="alp-cat__count">3 products</p></div>'
    f'<div class="alp-cat__grid" style="--alp-cat-cols:3">{cards}</div></div></div></section>'
    '<aside class="alp alp-cat__cta"><div class="alp-cat__cta-text"><h2>Get the route. Join the bush.</h2>'
    '<p>Curated gravel routes and events.</p></div>'
    '<a class="alp-chip alp-chip--flare" href="#">Open the map ↗</a></aside>', 'template-collection')

# ── Home: the density decision, re-pointed ──
PAGES['home'] = (rail('Home'),
    f'<section class="alp alp-hero"><div class="alp-hero__media"><img src="{SUNSET}" alt=""></div>'
    '<div class="alp-hero__veil"></div>'
    f'<div class="alp-hero__centre"><img class="alp-hero__mark" src="{MIST_MARK}" alt="">'
    '<p class="alp-hero__tagline">Made for the detour</p></div>'
    '<div class="alp-hero__caption"><p class="alp-hero__place">Mount Beerwah, Glass House Mountains</p>'
    '<p class="alp-hero__place">01</p></div></section>'
    + passage('bone', 'The country', 'Our country is vast, breath-taking and at times, unforgiving.',
              '<p>Sweltering summer storms electrocute the sky and clap our ears with thunder.</p>', ruled=True)
    + tile('medium', veil=True, eyebrow='Gap Creek Reserve, Bellbowrie', frame='02')
    + '<section class="alp alp-shelf alp-shelf--3up"><header class="alp-shelf__head">'
      '<p class="alp-shelf__eyebrow">The launch<br>November</p><div class="alp-shelf__headfield">'
      '<h2 class="alp-shelf__heading">Eight pieces, cut for long days.</h2>'
      '<a class="alp-chip alp-shelf__more" href="#">Shop the launch ✦</a></div></header>'
      '<div class="alp-shelf__grid">' + ''.join(
        f'<a class="alp-shelf__cell" href="#"><div class="alp-shelf__pic"><img src="{SUNSET}" alt=""></div>'
        '<div class="alp-shelf__meta"><p class="alp-shelf__name">Bush Riding Shorts</p>'
        '<p class="alp-shelf__price">$180</p></div></a>' for _ in range(3)) + '</div></section>'
    + passage('olive', 'Bush Map™',
              "Gravel routes, ride diaries, and the tracks that didn't make the map.", '', 'Open the map')
    + fab() + top(),
    'template-index')

PAGES['home-card'] = (rail('Home'),
    f'<section class="alp alp-hero"><div class="alp-hero__media"><img src="{SUNSET}" alt=""></div>'
    '<div class="alp-hero__veil"></div>'
    f'<div class="alp-hero__centre"><img class="alp-hero__mark" src="{MIST_MARK}" alt="">'
    '<p class="alp-hero__tagline">Made for the detour</p></div></section>'
    + nextride_card()
    + passage('bone', 'The country', 'Our country is vast, breath-taking and at times, unforgiving.',
              '<p>Sweltering summer storms electrocute the sky.</p>')
    + fab() + top(), 'template-index')

PAGES['menu-sheet'] = (rail('Home'),
    f'<section class="alp alp-hero"><div class="alp-hero__media"><img src="{SUNSET}" alt=""></div>'
    '<div class="alp-hero__veil"></div></section>' + fab() + sheet(True), 'template-index')

PAGES['product'] = (rail('Shop'),
    f'<section class="alp alp-phero"><div class="alp-phero__media"><img src="{SUNSET}" alt=""></div></section>'
    '<div class="alp alp-phero__id"><h1 class="alp-phero__name">Bush Riding Shorts</h1>'
    '<p class="alp-phero__price">$180</p></div>'
    f'<div class="alp-phero__pair"><img class="alp-phero__pairshot" src="{SUNSET}" alt="">'
    f'<img class="alp-phero__pairshot" src="{SUNSET}" alt=""></div>'
    + passage('bone', 'The piece', '',
              '<p>Designed for those long days when the road turns to dirt and you are not sure where you will end up.</p>')
    + buybar() + top(), 'template-product')

TPL = '''<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>{css}</style>
<style>
  /* Harness only: stand in for the Shopify-loaded brand faces so the metrics
     are at least sane. Real Archivo/Inter are not reachable offline. */
  :root {{ --alp-font-display: system-ui, sans-serif; --alp-font-ui: system-ui, sans-serif; }}
  html,body {{ margin:0; }}
  /* Harness only: svh fills whatever window we capture in, which makes a tall
     full-page shot look like nothing but hero. Pin it to a real fold height so
     everything below lays out where it actually would. */
  .alp-hero {{ min-height: 900px !important; }}
</style></head>
<body class="gradient {body_class}">{rail}<main id="MainContent">{main}</main></body></html>'''

for name, (r, main, body_class) in PAGES.items():
    html = TPL.format(css=CSS, rail=r, main=main, body_class=body_class)
    f = OUT / f'{name}.html'
    f.write_text(html, encoding='utf-8')
    for label, size in (('fold', '1440,900'), ('desktop', '1440,3200'),
                        ('mobile-fold', '390,844'), ('mobile', '390,2600')):
        subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                        '--no-sandbox', f'--window-size={size}',
                        f'--screenshot={OUT}/{name}-{label}.png', f'file://{f}'],
                       capture_output=True, timeout=120)
    print('rendered', name)
print('\nshots in', OUT)
