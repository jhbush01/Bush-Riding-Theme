import React from 'react';

export function Button(props){
  const variant=props.variant||'default';
  const [hover,setHover]=React.useState(false);
  const base={fontFamily:'var(--ui-font)',fontSize:'13px',fontWeight:600,letterSpacing:'0.02em',
    padding:'11px 18px',border:'1px solid var(--ink)',borderRadius:'2px',cursor:'pointer',
    background:'none',color:'var(--ink)',transition:'background 0.12s ease, color 0.12s ease'};
  const variants={
    default:{},
    primary:{background:'var(--ink)',color:'var(--cream-panel)',width:'100%'},
    danger:{borderColor:'#828059',color:'#828059'}
  };
  const hovers={default:{background:'var(--ink)',color:'var(--cream-panel)'},primary:{background:'#38382c'},danger:{background:'#828059',color:'#edecc5'}};
  const style=Object.assign({},base,variants[variant],hover?hovers[variant]:null,
    props.fullWidth?{width:'100%'}:null,props.style);
  return React.createElement(props.href?'a':'button',{href:props.href,type:props.href?undefined:(props.type||'button'),
    onClick:props.onClick,style:style,onMouseEnter:function(){setHover(true)},onMouseLeave:function(){setHover(false)}},props.children);
}
