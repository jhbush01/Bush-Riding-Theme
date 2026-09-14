import React from 'react';

export function Toast(props){
  return React.createElement('div',{role:'status',style:Object.assign({display:'inline-block',
    background:'var(--ink)',color:'var(--cream-panel)',fontSize:'13px',padding:'11px 18px',borderRadius:'3px'},props.style)},
    props.children);
}
