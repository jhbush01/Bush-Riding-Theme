import React from 'react';

export function MapPill(props){
  const items=props.items||[];
  return React.createElement('div',{style:Object.assign({display:'inline-flex',gap:'2px',padding:'4px',
    background:'rgba(244,243,220,0.82)',backdropFilter:'blur(10px)',WebkitBackdropFilter:'blur(10px)',
    border:'1px solid rgba(0,0,0,0.08)',borderRadius:'999px',boxShadow:'0 2px 12px rgba(76,75,59,0.18)'},props.style)},
    items.map(function(it){const on=it.value===props.value;
      return React.createElement('a',{key:it.value,href:it.href||'#',onClick:function(e){if(props.onChange){e.preventDefault();props.onChange(it.value)}},
        style:{padding:'7px 17px',borderRadius:'999px',fontFamily:'var(--ui-font)',fontSize:'13.5px',fontWeight:600,
          color:on?'var(--olive)':'var(--ink)',textDecoration:'none',letterSpacing:'0.01em',
          background:on?'rgba(0,0,0,0.05)':'transparent'}},it.label);}));
}
