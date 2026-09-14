import React from 'react';

/* The one storefront button/label primitive: .alp-chip. It is a button (hover
   inverts to ink), a label (price), or a form submit (ink fill). */
export function Chip(props){
  const variant=props.variant||'default';
  const [hover,setHover]=React.useState(false);
  const Tag=props.href?'a':(props.as||(props.onClick?'button':'span'));
  const interactive=Tag==='a'||Tag==='button';
  const base={display:'inline-flex',alignItems:'center',gap:'0.4em',
    background:'var(--alp-surface)',color:'var(--alp-ink)',
    border:'1px solid var(--alp-line)',borderRadius:'var(--alp-radius-chip)',
    padding:'8px 14px',fontFamily:'var(--alp-font-ui)',fontSize:'0.875rem',
    fontWeight:600,lineHeight:1.2,textDecoration:'none',whiteSpace:'nowrap',
    cursor:interactive?'pointer':'default',transition:'background 0.15s ease, color 0.15s ease'};
  const variants={
    default:{},
    price:{fontWeight:500},
    submit:{background:'var(--alp-ink)',color:'var(--alp-surface)',borderColor:'var(--alp-ink)'}
  };
  const hoverStyle=interactive?(variant==='submit'
    ?{background:'var(--alp-accent)',borderColor:'var(--alp-accent)'}
    :{background:'var(--alp-ink)',color:'var(--alp-surface)'}):null;
  const style=Object.assign({},base,variants[variant],hover?hoverStyle:null,props.style);
  return React.createElement(Tag,{href:props.href,type:Tag==='button'?(props.type||'button'):undefined,
    onClick:props.onClick,style:style,className:props.className,
    onMouseEnter:function(){setHover(true)},onMouseLeave:function(){setHover(false)}},
    props.children,
    props.glyph?React.createElement('span',{style:{fontStyle:'normal'}},'\u2726'):null);
}
