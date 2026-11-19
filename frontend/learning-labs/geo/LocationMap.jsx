import React,{useEffect,useId,useRef,useState} from 'react';
import {locationMaps} from './locations.js';
import {centeredViewport,initialMapViewport,markersViewport,regionViews,scaledViewport,shiftedViewport} from './map-viewport.js';
import watercolor from './region-maps/location-watercolor.webp';
import './location-map.css';

export function LocationMap({question,result,onChoose}){
 const uid=useId(),dialog=useRef(null),opener=useRef(null);
 const [enlarged,setEnlarged]=useState(false);
 const {view,paths,points}=locationMaps[question.branch];
 const [x,y,width,height]=view;
 const numbered=question.locations.map((place,index)=>{
  const [id,px,py]=points[place];
  return {id,x:px,y:py,number:question.choices[index]};
 });
 const [viewport,setViewport]=useState(()=>initialMapViewport(view,numbered,question.branch));
 const marked=result&&result.outcome!=='skipped';
 const correct=marked&&numbered.find(pin=>pin.number===question.answer);
 const presets=regionViews[question.branch]||[];
 const zoomLevel=Math.round(view[2]/viewport[2]*10)/10;
 const isFull=zoomLevel<=1.01;
 useEffect(()=>{
  setViewport(initialMapViewport(view,numbered,question.branch));
  setEnlarged(false);
  dialog.current?.close();
 },[question.id,question.branch]);
 const reset=()=>setViewport(view);
 const zoom=multiplier=>setViewport(current=>scaledViewport(view,current,multiplier));
 const pan=(dx,dy)=>setViewport(current=>shiftedViewport(view,current,dx,dy));
 const focusChoices=()=>setViewport(markersViewport(view,numbered));
 const selectRegion=name=>{
  const selected=presets.find(region=>region.name===name);
  if(selected)setViewport(centeredViewport(view,selected.center,selected.scale));
 };
 const paint=inDialog=>{
  const key=uid+(inDialog?'-zoom':'');
  return <svg className="location-map" viewBox={viewport.join(' ')} role="group"
    aria-label="Geography map with three numbered places. Zoom and pan using the controls below. Small island nations may use approximate locator points.">
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
   {correct&&(paths[correct.id]?<path d={paths[correct.id]} fill="#e8f8a5" fillOpacity=".62" stroke="#205438" strokeWidth="3" fillRule="evenodd"/>:<circle cx={correct.x} cy={correct.y} r="37" fill="none" stroke="#205438" strokeWidth="4" strokeDasharray="5 4" aria-label="Correct small country location"/>)}
   {numbered.map(pin=><g key={pin.number} transform={`translate(${pin.x},${pin.y})`}
    className={`location-pin${marked&&pin.number===question.answer?' correct':marked&&pin.number===result.selected?' incorrect':''}`}
    role={result?undefined:'button'} tabIndex={result?undefined:0} aria-label={`Choose marker ${pin.number}`}
    onClick={result?undefined:()=>choose(pin.number,inDialog)}
    onKeyDown={result?undefined:event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(pin.number,inDialog);}}}>
    <circle r="27"/><text y="1">{pin.number}</text>
   </g>)}
  </svg>;
 };
 function choose(number,inDialog){
  if(inDialog)dialog.current?.close();
  onChoose(number);
 }
 const controls=<div className="location-controls" aria-label="Map zoom and navigation controls">
  <div className="location-zoom-actions">
   <button type="button" onClick={()=>zoom(1.6)} disabled={zoomLevel>=4.95} aria-label="Zoom map in">+ Zoom in</button>
   <button type="button" onClick={()=>zoom(1/1.6)} disabled={isFull} aria-label="Zoom map out">− Zoom out</button>
   <button type="button" onClick={focusChoices}>Focus on markers</button>
   <button type="button" onClick={reset} disabled={isFull}>Full map</button>
   <span className="location-zoom-status" role="status">{zoomLevel.toFixed(1)}×</span>
  </div>
  {presets.length>0&&<div className="location-regions" aria-label="Zoom to a region">
   <span>Explore a region:</span>
   {presets.map(region=><button type="button" key={region.name} onClick={()=>selectRegion(region.name)}>{region.name}</button>)}
  </div>}
  <div className="location-pan" aria-label="Move the map">
   <span>Move map:</span>
   <button type="button" onClick={()=>pan(0,-.3)} disabled={isFull} aria-label="Move map north">↑</button>
   <button type="button" onClick={()=>pan(-.3,0)} disabled={isFull} aria-label="Move map west">←</button>
   <button type="button" onClick={()=>pan(.3,0)} disabled={isFull} aria-label="Move map east">→</button>
   <button type="button" onClick={()=>pan(0,.3)} disabled={isFull} aria-label="Move map south">↓</button>
  </div>
 </div>;
 return <><div className="location-frame">{paint(false)}</div>
  {controls}
  <button ref={opener} type="button" className="subtle location-zoom" onClick={()=>{setEnlarged(true);dialog.current?.showModal();}}>⌕ Enlarge map</button>
  <dialog className="landscape-lens location-dialog" ref={dialog} aria-label="Enlarged geography map" onClose={()=>{setEnlarged(false);opener.current?.focus();}}>
   <button type="button" className="close-lens" autoFocus onClick={()=>dialog.current?.close()}>Close map ×</button>
   {enlarged&&<>{paint(true)}{controls}</>}
  </dialog>
 </>;
}
