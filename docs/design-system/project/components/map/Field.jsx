import React from 'react';

export function Field(props){
  const [focus,setFocus]=React.useState(false);
  const control=React.createElement(props.multiline?'textarea':'input',{
    type:props.type||'text',value:props.value,defaultValue:props.defaultValue,placeholder:props.placeholder,
    rows:props.rows||3,onChange:props.onChange,onFocus:function(){setFocus(true)},onBlur:function(){setFocus(false)},
    style:{fontFamily:'var(--ui-font)',fontSize:'14px',padding:'10px 12px',
      border:'1px solid '+(focus?'var(--olive)':'var(--line)'),borderRadius:'2px',background:'#fff',color:'var(--ink)',
      width:'100%',outline:'none',resize:props.multiline?'vertical':undefined}});
  return React.createElement('div',{style:Object.assign({display:'flex',flexDirection:'column',gap:'6px'},props.style)},
    props.label?React.createElement('span',{style:{fontSize:'11px',fontWeight:600,textTransform:'uppercase',
      letterSpacing:'0.07em',color:'var(--ink-soft)'}},props.label):null,
    control,
    props.error?React.createElement('p',{style:{margin:0,fontSize:'13px',color:'#4c4b3b',background:'#ede270',padding:'9px 11px',borderRadius:'2px'}},props.error):null);
}
