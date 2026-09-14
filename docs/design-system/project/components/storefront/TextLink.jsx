import React from 'react';

export function TextLink(props){
  const [hover,setHover]=React.useState(false);
  return React.createElement('a',{href:props.href,onClick:props.onClick,
    style:Object.assign({color:hover?'var(--alp-accent)':'var(--alp-ink)',fontWeight:600,
      textDecoration:'underline',textUnderlineOffset:'4px',transition:'color 0.15s ease'},props.style),
    onMouseEnter:function(){setHover(true)},onMouseLeave:function(){setHover(false)}},props.children);
}
