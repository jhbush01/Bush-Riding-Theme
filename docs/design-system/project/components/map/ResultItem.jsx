import React from 'react';

export function ResultItem(props){
  const [hover,setHover]=React.useState(false);
  const on=props.active||hover;
  return React.createElement('li',{onClick:props.onClick,style:Object.assign({padding:'12px 20px',
    borderTop:'1px solid var(--line)',cursor:'pointer',background:on?'#e6e5c9':'transparent'},props.style),
    onMouseEnter:function(){setHover(true)},onMouseLeave:function(){setHover(false)}},
    React.createElement('p',{style:{fontSize:'14px',fontWeight:600,margin:0,color:'var(--ink)'}},props.name),
    props.meta?React.createElement('p',{style:{fontSize:'12px',color:'var(--ink-soft)',margin:'3px 0 0'}},props.meta):null);
}
