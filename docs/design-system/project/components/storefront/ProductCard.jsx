import React from 'react';
import { Chip } from './Chip.jsx';

/* .alp-card: a 3:4 image with the product name + price as chips overlaid
   bottom-left. No border, no shadow — the image is the card. */
export function ProductCard(props){
  return React.createElement('div',{style:Object.assign({position:'relative'},props.style)},
    React.createElement('a',{href:props.href,style:{display:'block',color:'inherit',textDecoration:'none'}},
      React.createElement('div',{style:{width:'100%',aspectRatio:'3 / 4',overflow:'hidden',background:'var(--alp-olive)'}},
        props.image||React.createElement('span',{style:{display:'block',width:'100%',height:'100%',
          background:'linear-gradient(135deg,#6b6740,#4c4930)'}})),
      React.createElement('div',{style:{position:'absolute',left:'16px',bottom:'16px',display:'flex',gap:'8px'}},
        React.createElement(Chip,{style:{fontSize:'0.8rem'}},props.name),
        props.price!=null?React.createElement(Chip,{variant:'price',style:{fontSize:'0.8rem'}},props.price):null)));
}
