import React from 'react';

/* Brand palette only — flare pending, sage approved, khaki rejected. */
const tones={
  pending:{background:'#ede270',color:'#4c4b3b'},
  rejected:{background:'#828059',color:'#edecc5'},
  approved:{background:'#b9bea3',color:'#4c4b3b'}
};
export function StatusBadge(props){
  const tone=props.tone||'pending';
  return React.createElement('span',{style:Object.assign({display:'inline-block',padding:'3px 9px',borderRadius:'999px',
    fontSize:'10.5px',fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase'},tones[tone],props.style)},
    props.children||tone);
}
