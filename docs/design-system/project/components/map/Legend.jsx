import React from 'react';

const colors={routes:'#4c4b3b',famous:'#ede270',bush:'#828059'};
export function Legend(props){
  const items=props.items||[{tone:'routes',label:'Community Routes'},{tone:'famous',label:'Famous Events'},{tone:'bush',label:'Bush Events'}];
  return React.createElement('ul',{style:Object.assign({listStyle:'none',margin:0,padding:0,display:'flex',flexDirection:'column',gap:'8px'},props.style)},
    items.map(function(it,i){return React.createElement('li',{key:i,style:{display:'flex',alignItems:'center',gap:'9px',fontSize:'13px',color:'var(--ink)'}},
      React.createElement('span',{style:{width:'11px',height:'11px',borderRadius:'50%',flex:'none',
        background:colors[it.tone],boxShadow:'0 0 0 1px rgba(0,0,0,0.08) inset'}}),it.label);}));
}
