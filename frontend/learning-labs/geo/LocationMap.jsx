import React,{useId,useRef,useState} from 'react';
import {locationMaps} from './locations.js';
import watercolor from './region-maps/location-watercolor.webp';
import './location-map.css';

export function LocationMap({question,result,onChoose}){
 const uid=useId(), dialog=useRef(null), opener=useRef(null);
 const [enlarged,setEnlarged]=useState(false);
 const {view,paths,points}=locationMaps[question.branch];
 const [x,y,width,height]=view;
 const numbered=question.locations.map((place,index)=>{
  const [id,px,py]=points[place];
  return {id,x:px,y:py,number:question.choices[index]};
 });
 const marked=result&&result.outcome!=='skipped';
 const correct=marked&&numbered.find(pin=>pin.number===question.answer);
 const paint=zoom=>{
  const key=uid+(zoom?'-zoom':'');
  return <svg className="location-map" viewBox={view.join(' ')} aria-label="Map with three numbered places">
   <defs>
    <radialGradient id={key+'-sea'}><stop stopColor="#6ac5cd"/><stop offset=".74" stopColor="#acdbd2"/><stop offset="1" stopColor="#fff1d7"/></radialGradient>
    <clipPath id={key+'-land'}>{Object.entries(paths).map(([id,d])=><path key={id} d={d} clipRule="evenodd"/>)}</clipPath>
    <filter id={key+'-grain'}><feTurbulence type="fractalNoise" baseFrequency=".42" seed="21" numOctaves="3"/><feColorMatrix type="saturate" values="0"/></filter>
   </defs>
   <rect {...{x,y,width,height}} fill={`url(#${key}-sea)`}/>
   <image {...{x,y,width,height}} href={watercolor} clipPath={`url(#${key}-land)`} preserveAspectRatio="none"/>
   <g fill="none" stroke="#284d44" strokeOpacity=".78" strokeWidth="1.6" strokeLinejoin="round">
    {Object.entries(paths).map(([id,d])=><path key={id} d={d}/>)}
   </g>
   <rect {...{x,y,width,height}} filter={`url(#${key}-grain)`} opacity=".1" pointerEvents="none" style={{mixBlendMode:'multiply'}}/>
   {correct&&<path d={paths[correct.id]} fill="#e8f8a5" fillOpacity=".62" stroke="#205438" strokeWidth="3" fillRule="evenodd"/>}
   {numbered.map(pin=><g key={pin.number} transform={`translate(${pin.x},${pin.y})`}
    className={`location-pin${marked&&pin.number===question.answer?' correct':marked&&pin.number===result.selected?' incorrect':''}`}
    role={result?undefined:'button'} tabIndex={result?undefined:0} aria-label={`Choose marker ${pin.number}`}
    onClick={result?undefined:()=>choose(pin.number,zoom)}
    onKeyDown={result?undefined:event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(pin.number,zoom);}}}>
    <circle r="27"/><text y="1">{pin.number}</text>
   </g>)}
  </svg>;
 };
 function choose(number,zoom){
  if(zoom)dialog.current?.close();
  onChoose(number);
 }
 return <><div className="location-frame">{paint(false)}</div>
  <button ref={opener} type="button" className="subtle location-zoom" onClick={()=>{setEnlarged(true);dialog.current.showModal();}}>⌕ Enlarge map</button>
  <dialog className="landscape-lens location-dialog" ref={dialog} aria-label="Enlarged map" onClose={()=>{setEnlarged(false);opener.current?.focus();}}>
   <button className="close-lens" autoFocus onClick={()=>dialog.current.close()}>Close map ×</button>
   {enlarged&&paint(true)}
  </dialog>
 </>;
}
