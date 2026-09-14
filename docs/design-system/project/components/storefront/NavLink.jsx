import React from 'react';

/* Bare translucent header links. On the home template they are citrus; on
   inner pages they are translucent white over the media. */
export function NavLink(props){
  const [hover,setHover]=React.useState(false);
  const home=props.tone==='home';
  const base={background:'transparent',border:0,cursor:'pointer',padding:'8px 10px',
    fontFamily:'var(--alp-font-ui)',fontWeight:props.wordmark?800:600,
    fontSize:props.wordmark?'clamp(1.55rem,2vw + 1rem,2.85rem)':(props.clock?'clamp(1rem,1.2vw + 0.7rem,1.8rem)':'clamp(1.4rem,1.8vw + 0.9rem,2.625rem)'),
    lineHeight:1.2,textDecoration:'none',whiteSpace:'nowrap',
    letterSpacing:props.wordmark?'0.01em':undefined,
    fontVariantNumeric:props.clock?'tabular-nums':undefined,
    color:home?'var(--alp-citrus)':'rgba(255,255,255,0.6)',
    textShadow:'0 1px 4px rgba(22,21,15,0.25)',
    transition:'color 0.15s ease'};
  const hoverColor=home?'#fff':'rgba(255,255,255,0.9)';
  const Tag=props.href?'a':'button';
  return React.createElement(Tag,{href:props.href,type:props.href?undefined:'button',onClick:props.onClick,
    style:Object.assign({},base,hover?{color:hoverColor}:null,props.style),
    onMouseEnter:function(){setHover(true)},onMouseLeave:function(){setHover(false)}},props.children);
}
