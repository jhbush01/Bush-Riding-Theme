import React from 'react';

/* The brush wordmark is artwork, not a font: a cream-on-transparent PNG sized
   by HEIGHT so it holds aspect ratio. On the home hero it drops a soft shadow
   to survive over bright sky. */
export function Wordmark(props){
  const src=props.src||'../../assets/logo-wordmark.png';
  const height=props.height||62;
  const img=React.createElement('img',{src:src,alt:props.alt||'Bush Riding',
    style:{display:'block',height:height+'px',width:'auto',maxWidth:'none',
      filter:props.shadow===false?'none':'drop-shadow(0 1px 4px rgba(22,21,15,0.25))'}});
  if(props.href) return React.createElement('a',{href:props.href,
    style:Object.assign({display:'inline-flex',alignItems:'center',textDecoration:'none'},props.style)},img);
  return React.createElement('span',{style:Object.assign({display:'inline-flex',alignItems:'center'},props.style)},img);
}
