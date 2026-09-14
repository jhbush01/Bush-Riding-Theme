/* @ds-bundle: {"format":4,"namespace":"BushRidingDesignSystem_e1a4ad","components":[{"name":"Button","sourcePath":"components/map/Button.jsx"},{"name":"Field","sourcePath":"components/map/Field.jsx"},{"name":"FilterPill","sourcePath":"components/map/FilterPill.jsx"},{"name":"Legend","sourcePath":"components/map/Legend.jsx"},{"name":"MapPill","sourcePath":"components/map/MapPill.jsx"},{"name":"ResultItem","sourcePath":"components/map/ResultItem.jsx"},{"name":"Select","sourcePath":"components/map/Select.jsx"},{"name":"StatusBadge","sourcePath":"components/map/StatusBadge.jsx"},{"name":"Toast","sourcePath":"components/map/Toast.jsx"},{"name":"Toggle","sourcePath":"components/map/Toggle.jsx"},{"name":"Chip","sourcePath":"components/storefront/Chip.jsx"},{"name":"NavLink","sourcePath":"components/storefront/NavLink.jsx"},{"name":"ProductCard","sourcePath":"components/storefront/ProductCard.jsx"},{"name":"TextLink","sourcePath":"components/storefront/TextLink.jsx"},{"name":"Wordmark","sourcePath":"components/storefront/Wordmark.jsx"}],"sourceHashes":{"components/map/Button.jsx":"3605094877b1","components/map/Field.jsx":"715b953ec6c5","components/map/FilterPill.jsx":"e580cbd04268","components/map/Legend.jsx":"2cd097671dfa","components/map/MapPill.jsx":"bd369284c01f","components/map/ResultItem.jsx":"cea452ae854d","components/map/Select.jsx":"cb4d715b9fbc","components/map/StatusBadge.jsx":"bbdfb2cd2a86","components/map/Toast.jsx":"0e621f3604b0","components/map/Toggle.jsx":"a7e6f61c8dae","components/storefront/Chip.jsx":"687ce7d20004","components/storefront/NavLink.jsx":"c86c12c3ce8f","components/storefront/ProductCard.jsx":"3a461f866507","components/storefront/TextLink.jsx":"0c5ad1aca7be","components/storefront/Wordmark.jsx":"e4b9a61a6d0d"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BushRidingDesignSystem_e1a4ad = window.BushRidingDesignSystem_e1a4ad || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/map/Button.jsx
try { (() => {
function Button(props) {
  const variant = props.variant || 'default';
  const [hover, setHover] = React.useState(false);
  const base = {
    fontFamily: 'var(--ui-font)',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    padding: '11px 18px',
    border: '1px solid var(--ink)',
    borderRadius: '2px',
    cursor: 'pointer',
    background: 'none',
    color: 'var(--ink)',
    transition: 'background 0.12s ease, color 0.12s ease'
  };
  const variants = {
    default: {},
    primary: {
      background: 'var(--ink)',
      color: 'var(--cream-panel)',
      width: '100%'
    },
    danger: {
      borderColor: '#828059',
      color: '#828059'
    }
  };
  const hovers = {
    default: {
      background: 'var(--ink)',
      color: 'var(--cream-panel)'
    },
    primary: {
      background: '#38382c'
    },
    danger: {
      background: '#828059',
      color: '#edecc5'
    }
  };
  const style = Object.assign({}, base, variants[variant], hover ? hovers[variant] : null, props.fullWidth ? {
    width: '100%'
  } : null, props.style);
  return React.createElement(props.href ? 'a' : 'button', {
    href: props.href,
    type: props.href ? undefined : props.type || 'button',
    onClick: props.onClick,
    style: style,
    onMouseEnter: function () {
      setHover(true);
    },
    onMouseLeave: function () {
      setHover(false);
    }
  }, props.children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/Button.jsx", error: String((e && e.message) || e) }); }

// components/map/Field.jsx
try { (() => {
function Field(props) {
  const [focus, setFocus] = React.useState(false);
  const control = React.createElement(props.multiline ? 'textarea' : 'input', {
    type: props.type || 'text',
    value: props.value,
    defaultValue: props.defaultValue,
    placeholder: props.placeholder,
    rows: props.rows || 3,
    onChange: props.onChange,
    onFocus: function () {
      setFocus(true);
    },
    onBlur: function () {
      setFocus(false);
    },
    style: {
      fontFamily: 'var(--ui-font)',
      fontSize: '14px',
      padding: '10px 12px',
      border: '1px solid ' + (focus ? 'var(--olive)' : 'var(--line)'),
      borderRadius: '2px',
      background: '#fff',
      color: 'var(--ink)',
      width: '100%',
      outline: 'none',
      resize: props.multiline ? 'vertical' : undefined
    }
  });
  return React.createElement('div', {
    style: Object.assign({
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }, props.style)
  }, props.label ? React.createElement('span', {
    style: {
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.07em',
      color: 'var(--ink-soft)'
    }
  }, props.label) : null, control, props.error ? React.createElement('p', {
    style: {
      margin: 0,
      fontSize: '13px',
      color: '#4c4b3b',
      background: '#ede270',
      padding: '9px 11px',
      borderRadius: '2px'
    }
  }, props.error) : null);
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/Field.jsx", error: String((e && e.message) || e) }); }

// components/map/FilterPill.jsx
try { (() => {
/* Brand palette only: olive / khaki / flare. The app's terracotta and plum are retired. */
const dot = {
  routes: '#4c4b3b',
  bush: '#828059',
  famous: '#ede270'
};
function FilterPill(props) {
  const active = props.active !== false;
  const [hover, setHover] = React.useState(false);
  const style = Object.assign({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 12px',
    borderRadius: '999px',
    border: '1px solid ' + (active || hover ? '#828059' : 'var(--line)'),
    background: active ? 'var(--cream-panel)' : 'transparent',
    fontFamily: 'var(--ui-font)',
    fontSize: '12.5px',
    fontWeight: 600,
    color: active ? 'var(--ink)' : 'var(--ink-soft)',
    cursor: 'pointer',
    opacity: active ? 1 : 0.55,
    transition: 'background 0.14s ease, border-color 0.14s ease, opacity 0.14s ease'
  }, props.style);
  return React.createElement('button', {
    type: 'button',
    'aria-pressed': active,
    onClick: props.onClick,
    style: style,
    onMouseEnter: function () {
      setHover(true);
    },
    onMouseLeave: function () {
      setHover(false);
    }
  }, React.createElement('span', {
    style: {
      width: '9px',
      height: '9px',
      borderRadius: '50%',
      flex: 'none',
      background: active ? dot[props.tone] || dot.routes : '#b9bea3',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.08) inset'
    }
  }), props.children);
}
Object.assign(__ds_scope, { FilterPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/FilterPill.jsx", error: String((e && e.message) || e) }); }

// components/map/Legend.jsx
try { (() => {
const colors = {
  routes: '#4c4b3b',
  famous: '#ede270',
  bush: '#828059'
};
function Legend(props) {
  const items = props.items || [{
    tone: 'routes',
    label: 'Community Routes'
  }, {
    tone: 'famous',
    label: 'Famous Events'
  }, {
    tone: 'bush',
    label: 'Bush Events'
  }];
  return React.createElement('ul', {
    style: Object.assign({
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }, props.style)
  }, items.map(function (it, i) {
    return React.createElement('li', {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        fontSize: '13px',
        color: 'var(--ink)'
      }
    }, React.createElement('span', {
      style: {
        width: '11px',
        height: '11px',
        borderRadius: '50%',
        flex: 'none',
        background: colors[it.tone],
        boxShadow: '0 0 0 1px rgba(0,0,0,0.08) inset'
      }
    }), it.label);
  }));
}
Object.assign(__ds_scope, { Legend });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/Legend.jsx", error: String((e && e.message) || e) }); }

// components/map/MapPill.jsx
try { (() => {
function MapPill(props) {
  const items = props.items || [];
  return React.createElement('div', {
    style: Object.assign({
      display: 'inline-flex',
      gap: '2px',
      padding: '4px',
      background: 'rgba(244,243,220,0.82)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(0,0,0,0.08)',
      borderRadius: '999px',
      boxShadow: '0 2px 12px rgba(76,75,59,0.18)'
    }, props.style)
  }, items.map(function (it) {
    const on = it.value === props.value;
    return React.createElement('a', {
      key: it.value,
      href: it.href || '#',
      onClick: function (e) {
        if (props.onChange) {
          e.preventDefault();
          props.onChange(it.value);
        }
      },
      style: {
        padding: '7px 17px',
        borderRadius: '999px',
        fontFamily: 'var(--ui-font)',
        fontSize: '13.5px',
        fontWeight: 600,
        color: on ? 'var(--olive)' : 'var(--ink)',
        textDecoration: 'none',
        letterSpacing: '0.01em',
        background: on ? 'rgba(0,0,0,0.05)' : 'transparent'
      }
    }, it.label);
  }));
}
Object.assign(__ds_scope, { MapPill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/MapPill.jsx", error: String((e && e.message) || e) }); }

// components/map/ResultItem.jsx
try { (() => {
function ResultItem(props) {
  const [hover, setHover] = React.useState(false);
  const on = props.active || hover;
  return React.createElement('li', {
    onClick: props.onClick,
    style: Object.assign({
      padding: '12px 20px',
      borderTop: '1px solid var(--line)',
      cursor: 'pointer',
      background: on ? '#e6e5c9' : 'transparent'
    }, props.style),
    onMouseEnter: function () {
      setHover(true);
    },
    onMouseLeave: function () {
      setHover(false);
    }
  }, React.createElement('p', {
    style: {
      fontSize: '14px',
      fontWeight: 600,
      margin: 0,
      color: 'var(--ink)'
    }
  }, props.name), props.meta ? React.createElement('p', {
    style: {
      fontSize: '12px',
      color: 'var(--ink-soft)',
      margin: '3px 0 0'
    }
  }, props.meta) : null);
}
Object.assign(__ds_scope, { ResultItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/ResultItem.jsx", error: String((e && e.message) || e) }); }

// components/map/Select.jsx
try { (() => {
function Select(props) {
  const options = props.options || [];
  return React.createElement('select', {
    value: props.value,
    defaultValue: props.defaultValue,
    onChange: props.onChange,
    'aria-label': props.label,
    style: Object.assign({
      fontFamily: 'var(--ui-font)',
      fontSize: '13px',
      padding: '7px 8px',
      border: '1px solid var(--line)',
      background: '#fff',
      color: 'var(--ink)',
      borderRadius: '2px'
    }, props.style)
  }, options.map(function (o, i) {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return React.createElement('option', {
      key: i,
      value: v
    }, l);
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/Select.jsx", error: String((e && e.message) || e) }); }

// components/map/StatusBadge.jsx
try { (() => {
/* Brand palette only — flare pending, sage approved, khaki rejected. */
const tones = {
  pending: {
    background: '#ede270',
    color: '#4c4b3b'
  },
  rejected: {
    background: '#828059',
    color: '#edecc5'
  },
  approved: {
    background: '#b9bea3',
    color: '#4c4b3b'
  }
};
function StatusBadge(props) {
  const tone = props.tone || 'pending';
  return React.createElement('span', {
    style: Object.assign({
      display: 'inline-block',
      padding: '3px 9px',
      borderRadius: '999px',
      fontSize: '10.5px',
      fontWeight: 700,
      letterSpacing: '0.04em',
      textTransform: 'uppercase'
    }, tones[tone], props.style)
  }, props.children || tone);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/map/Toast.jsx
try { (() => {
function Toast(props) {
  return React.createElement('div', {
    role: 'status',
    style: Object.assign({
      display: 'inline-block',
      background: 'var(--ink)',
      color: 'var(--cream-panel)',
      fontSize: '13px',
      padding: '11px 18px',
      borderRadius: '3px'
    }, props.style)
  }, props.children);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/Toast.jsx", error: String((e && e.message) || e) }); }

// components/map/Toggle.jsx
try { (() => {
function Toggle(props) {
  const items = props.items || [];
  return React.createElement('div', {
    role: 'group',
    style: Object.assign({
      display: 'flex',
      gap: '6px'
    }, props.style)
  }, items.map(function (it) {
    const on = it.value === props.value;
    return React.createElement('button', {
      key: it.value,
      type: 'button',
      onClick: function () {
        props.onChange && props.onChange(on ? null : it.value);
      },
      style: {
        flex: 1,
        fontFamily: 'var(--ui-font)',
        fontSize: '12px',
        padding: '7px 4px',
        border: '1px solid ' + (on ? 'var(--olive)' : 'var(--line)'),
        borderRadius: '2px',
        cursor: 'pointer',
        background: on ? 'var(--olive)' : '#fff',
        color: on ? '#fff' : 'var(--ink-soft)',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s'
      }
    }, it.label);
  }));
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/map/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/storefront/Chip.jsx
try { (() => {
/* The one storefront button/label primitive: .alp-chip. It is a button (hover
   inverts to ink), a label (price), or a form submit (ink fill). */
function Chip(props) {
  const variant = props.variant || 'default';
  const [hover, setHover] = React.useState(false);
  const Tag = props.href ? 'a' : props.as || (props.onClick ? 'button' : 'span');
  const interactive = Tag === 'a' || Tag === 'button';
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4em',
    background: 'var(--alp-surface)',
    color: 'var(--alp-ink)',
    border: '1px solid var(--alp-line)',
    borderRadius: 'var(--alp-radius-chip)',
    padding: '8px 14px',
    fontFamily: 'var(--alp-font-ui)',
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.2,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    cursor: interactive ? 'pointer' : 'default',
    transition: 'background 0.15s ease, color 0.15s ease'
  };
  const variants = {
    default: {},
    price: {
      fontWeight: 500
    },
    submit: {
      background: 'var(--alp-ink)',
      color: 'var(--alp-surface)',
      borderColor: 'var(--alp-ink)'
    }
  };
  const hoverStyle = interactive ? variant === 'submit' ? {
    background: 'var(--alp-accent)',
    borderColor: 'var(--alp-accent)'
  } : {
    background: 'var(--alp-ink)',
    color: 'var(--alp-surface)'
  } : null;
  const style = Object.assign({}, base, variants[variant], hover ? hoverStyle : null, props.style);
  return React.createElement(Tag, {
    href: props.href,
    type: Tag === 'button' ? props.type || 'button' : undefined,
    onClick: props.onClick,
    style: style,
    className: props.className,
    onMouseEnter: function () {
      setHover(true);
    },
    onMouseLeave: function () {
      setHover(false);
    }
  }, props.children, props.glyph ? React.createElement('span', {
    style: {
      fontStyle: 'normal'
    }
  }, '\u2726') : null);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/storefront/Chip.jsx", error: String((e && e.message) || e) }); }

// components/storefront/NavLink.jsx
try { (() => {
/* Bare translucent header links. On the home template they are citrus; on
   inner pages they are translucent white over the media. */
function NavLink(props) {
  const [hover, setHover] = React.useState(false);
  const home = props.tone === 'home';
  const base = {
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    padding: '8px 10px',
    fontFamily: 'var(--alp-font-ui)',
    fontWeight: props.wordmark ? 800 : 600,
    fontSize: props.wordmark ? 'clamp(1.55rem,2vw + 1rem,2.85rem)' : props.clock ? 'clamp(1rem,1.2vw + 0.7rem,1.8rem)' : 'clamp(1.4rem,1.8vw + 0.9rem,2.625rem)',
    lineHeight: 1.2,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    letterSpacing: props.wordmark ? '0.01em' : undefined,
    fontVariantNumeric: props.clock ? 'tabular-nums' : undefined,
    color: home ? 'var(--alp-citrus)' : 'rgba(255,255,255,0.6)',
    textShadow: '0 1px 4px rgba(22,21,15,0.25)',
    transition: 'color 0.15s ease'
  };
  const hoverColor = home ? '#fff' : 'rgba(255,255,255,0.9)';
  const Tag = props.href ? 'a' : 'button';
  return React.createElement(Tag, {
    href: props.href,
    type: props.href ? undefined : 'button',
    onClick: props.onClick,
    style: Object.assign({}, base, hover ? {
      color: hoverColor
    } : null, props.style),
    onMouseEnter: function () {
      setHover(true);
    },
    onMouseLeave: function () {
      setHover(false);
    }
  }, props.children);
}
Object.assign(__ds_scope, { NavLink });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/storefront/NavLink.jsx", error: String((e && e.message) || e) }); }

// components/storefront/ProductCard.jsx
try { (() => {
/* .alp-card: a 3:4 image with the product name + price as chips overlaid
   bottom-left. No border, no shadow — the image is the card. */
function ProductCard(props) {
  return React.createElement('div', {
    style: Object.assign({
      position: 'relative'
    }, props.style)
  }, React.createElement('a', {
    href: props.href,
    style: {
      display: 'block',
      color: 'inherit',
      textDecoration: 'none'
    }
  }, React.createElement('div', {
    style: {
      width: '100%',
      aspectRatio: '3 / 4',
      overflow: 'hidden',
      background: 'var(--alp-olive)'
    }
  }, props.image || React.createElement('span', {
    style: {
      display: 'block',
      width: '100%',
      height: '100%',
      background: 'linear-gradient(135deg,#6b6740,#4c4930)'
    }
  })), React.createElement('div', {
    style: {
      position: 'absolute',
      left: '16px',
      bottom: '16px',
      display: 'flex',
      gap: '8px'
    }
  }, React.createElement(__ds_scope.Chip, {
    style: {
      fontSize: '0.8rem'
    }
  }, props.name), props.price != null ? React.createElement(__ds_scope.Chip, {
    variant: 'price',
    style: {
      fontSize: '0.8rem'
    }
  }, props.price) : null)));
}
Object.assign(__ds_scope, { ProductCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/storefront/ProductCard.jsx", error: String((e && e.message) || e) }); }

// components/storefront/TextLink.jsx
try { (() => {
function TextLink(props) {
  const [hover, setHover] = React.useState(false);
  return React.createElement('a', {
    href: props.href,
    onClick: props.onClick,
    style: Object.assign({
      color: hover ? 'var(--alp-accent)' : 'var(--alp-ink)',
      fontWeight: 600,
      textDecoration: 'underline',
      textUnderlineOffset: '4px',
      transition: 'color 0.15s ease'
    }, props.style),
    onMouseEnter: function () {
      setHover(true);
    },
    onMouseLeave: function () {
      setHover(false);
    }
  }, props.children);
}
Object.assign(__ds_scope, { TextLink });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/storefront/TextLink.jsx", error: String((e && e.message) || e) }); }

// components/storefront/Wordmark.jsx
try { (() => {
/* The brush wordmark is artwork, not a font: a cream-on-transparent PNG sized
   by HEIGHT so it holds aspect ratio. On the home hero it drops a soft shadow
   to survive over bright sky. */
function Wordmark(props) {
  const src = props.src || '../../assets/logo-wordmark.png';
  const height = props.height || 62;
  const img = React.createElement('img', {
    src: src,
    alt: props.alt || 'Bush Riding',
    style: {
      display: 'block',
      height: height + 'px',
      width: 'auto',
      maxWidth: 'none',
      filter: props.shadow === false ? 'none' : 'drop-shadow(0 1px 4px rgba(22,21,15,0.25))'
    }
  });
  if (props.href) return React.createElement('a', {
    href: props.href,
    style: Object.assign({
      display: 'inline-flex',
      alignItems: 'center',
      textDecoration: 'none'
    }, props.style)
  }, img);
  return React.createElement('span', {
    style: Object.assign({
      display: 'inline-flex',
      alignItems: 'center'
    }, props.style)
  }, img);
}
Object.assign(__ds_scope, { Wordmark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/storefront/Wordmark.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.FilterPill = __ds_scope.FilterPill;

__ds_ns.Legend = __ds_scope.Legend;

__ds_ns.MapPill = __ds_scope.MapPill;

__ds_ns.ResultItem = __ds_scope.ResultItem;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.NavLink = __ds_scope.NavLink;

__ds_ns.ProductCard = __ds_scope.ProductCard;

__ds_ns.TextLink = __ds_scope.TextLink;

__ds_ns.Wordmark = __ds_scope.Wordmark;

})();
