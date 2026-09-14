import React from 'react';

export function Select(props){
  const options=props.options||[];
  return React.createElement('select',{value:props.value,defaultValue:props.defaultValue,onChange:props.onChange,
    'aria-label':props.label,style:Object.assign({fontFamily:'var(--ui-font)',fontSize:'13px',padding:'7px 8px',
      border:'1px solid var(--line)',background:'#fff',color:'var(--ink)',borderRadius:'2px'},props.style)},
    options.map(function(o,i){const v=typeof o==='string'?o:o.value;const l=typeof o==='string'?o:o.label;
      return React.createElement('option',{key:i,value:v},l);}));
}
