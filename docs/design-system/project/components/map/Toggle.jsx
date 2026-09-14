import React from 'react';

export function Toggle(props){
  const items=props.items||[];
  return React.createElement('div',{role:'group',style:Object.assign({display:'flex',gap:'6px'},props.style)},
    items.map(function(it){
      const on=it.value===props.value;
      return React.createElement('button',{key:it.value,type:'button',onClick:function(){props.onChange&&props.onChange(on?null:it.value)},
        style:{flex:1,fontFamily:'var(--ui-font)',fontSize:'12px',padding:'7px 4px',
          border:'1px solid '+(on?'var(--olive)':'var(--line)'),borderRadius:'2px',cursor:'pointer',
          background:on?'var(--olive)':'#fff',color:on?'#fff':'var(--ink-soft)',
          transition:'background 0.12s, color 0.12s, border-color 0.12s'}},it.label);
    }));
}
