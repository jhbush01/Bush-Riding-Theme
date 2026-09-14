import React from 'react';

/* Brand palette only: olive / khaki / flare. The app's terracotta and plum are retired. */
const dot={routes:'#4c4b3b',bush:'#828059',famous:'#ede270'};
export function FilterPill(props){
  const active=props.active!==false;
  const [hover,setHover]=React.useState(false);
  const style=Object.assign({display:'inline-flex',alignItems:'center',gap:'7px',
    padding:'7px 12px',borderRadius:'999px',border:'1px solid '+(active||hover?'#828059':'var(--line)'),
    background:active?'var(--cream-panel)':'transparent',
    fontFamily:'var(--ui-font)',fontSize:'12.5px',fontWeight:600,
    color:active?'var(--ink)':'var(--ink-soft)',cursor:'pointer',
    opacity:active?1:0.55,transition:'background 0.14s ease, border-color 0.14s ease, opacity 0.14s ease'},props.style);
  return React.createElement('button',{type:'button','aria-pressed':active,onClick:props.onClick,style:style,
    onMouseEnter:function(){setHover(true)},onMouseLeave:function(){setHover(false)}},
    React.createElement('span',{style:{width:'9px',height:'9px',borderRadius:'50%',flex:'none',
      background:active?(dot[props.tone]||dot.routes):'#b9bea3',
      boxShadow:'0 0 0 1px rgba(0,0,0,0.08) inset'}}),
    props.children);
}
