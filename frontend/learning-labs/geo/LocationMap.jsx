import React,{useId,useRef,useState} from 'react';
import {questionGeography,locationMaps} from './locations.js';
import closeups from './location-insets.json' with {type:'json'};
import {centeredViewport,initialMapViewport,markersViewport,regionViews,scaledViewport,shiftedViewport} from './map-viewport.js';
import watercolor from './region-maps/location-watercolor.webp';
import {layoutMarkerCallouts} from './marker-callouts.js';
import './location-map.css';

export function LocationMap({question,result,onChoose,children}){
 const uid=useId(),dialog=useRef(null),opener=useRef(null);
 const [enlarged,setEnlarged]=useState(false);
 const [continent,setContinent]=useState(false),[extent,setExtent]=useState(false);
 const {view,panels,hasInset,label,hasExtent}=questionGeography(question,{continent,extent});
 const numbered=panels.flatMap(panel=>panel.numbered);
 const split=panels.length>1;
 const regional=split?locationMaps[question.branch]:null;
 const startView=()=>hasInset?view:initialMapViewport(view,numbered,question.branch);
 const [viewport,setViewport]=useState(startView);
 const marked=result&&result.outcome!=='skipped';
 const presets=(!hasInset||continent)?regionViews[question.branch]||[]:[];
 const zoomLevel=Math.round(view[2]/viewport[2]*10)/10;
 const isFull=zoomLevel<=1.01;
 const changeView=(nextContinent,nextExtent=false)=>{
  const next=questionGeography(question,{continent:nextContinent,extent:nextExtent});
  setContinent(nextContinent);
  setExtent(nextExtent);
  setViewport(next.view);
 };
 const reset=()=>setViewport(view);
 const zoom=multiplier=>setViewport(current=>scaledViewport(view,current,multiplier));
 const pan=(dx,dy)=>setViewport(current=>shiftedViewport(view,current,dx,dy));
 const focusChoices=()=>{
  if(continent){changeView(false);return;}
  setViewport(hasInset?view:markersViewport(view,numbered));
 };
 const selectRegion=name=>{
  const selected=presets.find(region=>region.name===name);
  if(selected)setViewport(centeredViewport(view,selected.center,selected.scale));
 };
 const paint=(inDialog,{paths,numbered,widthKm,center},index)=>{
  const key=uid+(inDialog?'-zoom':'')+'-'+index;
  const [x,y,width,height]=view;
  const correct=marked&&numbered.find(pin=>pin.number===question.answer);
  const {gutter,radius,callouts}=layoutMarkerCallouts(viewport,numbered,split ? .06 : .03);
  const [vx,vy,vw,vh]=viewport;
  return <div className="location-sheet" key={index}><svg className="location-map" viewBox={[vx-gutter,vy,vw+2*gutter,vh].join(' ')} role="group"
    aria-label={numbered.length?`Geography map with numbered arrows ${numbered.map(pin=>pin.number).join(', ')}.`:'Continental overview'}>
   <defs>
    <radialGradient id={key+'-sea'}><stop stopColor="#6ac5cd"/><stop offset=".74" stopColor="#acdbd2"/><stop offset="1" stopColor="#fff1d7"/></radialGradient>
    <clipPath id={key+'-land'}>{Object.entries(paths).map(([id,d])=><path key={id} d={d} clipRule="evenodd"/>)}</clipPath>
    <clipPath id={key+'-viewport'}><rect x={vx} y={vy} width={vw} height={vh}/></clipPath>
    <filter id={key+'-grain'}><feTurbulence type="fractalNoise" baseFrequency=".42" seed="21" numOctaves="3"/><feColorMatrix type="saturate" values="0"/></filter>
   </defs>
   <rect x={vx-gutter} y={vy} width={vw+2*gutter} height={vh} fill="#fff4dc"/>
   <g clipPath={`url(#${key}-viewport)`}>
   <rect {...{x,y,width,height}} fill={`url(#${key}-sea)`}/>
   <image {...{x,y,width,height}} href={watercolor} clipPath={`url(#${key}-land)`} preserveAspectRatio="none"/>
   {label&&<rect {...{x,y,width,height}} fill="#829767" clipPath={`url(#${key}-land)`} style={{mixBlendMode:'color'}}/>}
   <g fill="none" stroke={label?'#284955':'#284d44'} strokeOpacity=".78" strokeWidth={hasInset&&!continent?Math.min(1.45,1.45*vw/view[2]):1.6} strokeLinejoin="round">
    {Object.entries(paths).map(([id,d])=><path key={id} d={d}/>)}
   </g>
   <rect {...{x,y,width,height}} filter={`url(#${key}-grain)`} opacity=".1" pointerEvents="none" style={{mixBlendMode:'multiply'}}/>
   {correct&&<path d={paths[correct.id]} fill="#e8f8a5" fillOpacity=".62" stroke="#205438" strokeWidth={3*vw/view[2]} fillRule="evenodd"/>}
   </g>
   {callouts.map(pin=><g key={pin.number} className="location-callout">
    <path d={`M${pin.start.x},${pin.start.y} L${pin.tip.x},${pin.tip.y}`}
      stroke="#fff8e6" strokeWidth={radius*.2} strokeLinecap="round" fill="none" pointerEvents="none"/>
    <path d={`M${pin.start.x},${pin.start.y} L${pin.tip.x},${pin.tip.y}`}
      stroke="#173e58" strokeWidth={radius*.09} strokeLinecap="round" fill="none" pointerEvents="none"/>
    <polygon points={pin.arrowPoints} fill="#173e58" stroke="#fff8e6" strokeWidth={radius*.04} pointerEvents="none"/>
    <g transform={`translate(${pin.badge.x},${pin.badge.y})`}
      className={`location-pin location-callout-badge${marked&&pin.number===question.answer?' correct':marked&&pin.number===result.selected?' incorrect':''}`}
      role={result?undefined:'button'} tabIndex={result?undefined:0} aria-label={`Choose marker ${pin.number}`}
      onClick={result?undefined:()=>choose(pin.number,inDialog)}
      onKeyDown={result?undefined:event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(pin.number,inDialog);}}}>
      <circle r={pin.radius} strokeWidth={radius*.09}/>
      <text y={radius*.035} style={{fontSize:radius*1.15}}>{pin.number}</text>
    </g>
   </g>)}
  </svg>
  {widthKm&&<p className="location-scale">{center&&<span>{coordinate(center[1],'N','S')} · {coordinate(center[0],'E','W')}</span>}
   <span>Map width ≈ {formatScale(widthKm*vw/view[2])}</span></p>}
  </div>;
 };
 const renderLocator=()=>{
  if(!regional)return null;
  const coords=question.locations.map((name,index)=>({
   number:question.choices[index],name,
   center:closeups[name]?.center
  })).filter(item=>item.center);
  // These are geographic longitude/latitude coordinates, not the Australia
  // regional-map pixel positions (which omit many Pacific island states).
  const longitudes=coords.map(item=>(item.center[0]+360)%360);
  const lats=coords.map(item=>item.center[1]);
  const left=Math.min(...longitudes)-22,right=Math.max(...longitudes)+22;
  const top=Math.max(30,Math.max(...lats)+18),bottom=Math.min(-38,Math.min(...lats)-18);
  const project=([lon,lat])=>({
   x:60+880*((lon+360)%360-left)/Math.max(1,right-left),
   y:40+390*(top-lat)/Math.max(1,top-bottom)
  });
  const regionTitle=label==='Pacific islands'?'The Pacific Region — Oceania':label==='Lesser Antilles'?'The Caribbean — Lesser Antilles':label==='Indian Ocean islands'?'The Indian Ocean':label||'Island region';
  return <section className="location-region-map" aria-label="Island positions on the regional map">
   <p className="location-region-heading">{regionTitle}</p>
   <svg viewBox="0 0 1000 480" role="img" aria-label={`${regionTitle} with numbered locations at their geographic coordinates`}>
    <defs>
     <radialGradient id={uid+'-ocean'}><stop stopColor="#b5e5dd"/><stop offset="1" stopColor="#85c2d0"/></radialGradient>
     <pattern id={uid+'-grid'} width="90" height="65" patternUnits="userSpaceOnUse"><path d="M90 0H0V65" fill="none" stroke="#eff8e6" strokeOpacity=".45" strokeWidth="2"/></pattern>
    </defs>
    <rect width="1000" height="480" fill={`url(#${uid}-ocean)`}/>
    <rect width="1000" height="480" fill={`url(#${uid}-grid)`}/>
    <text x="500" y="96" textAnchor="middle" fontFamily="Georgia,serif" letterSpacing="8" fontWeight="700" fill="#225773" fontSize="34">{label==='Pacific islands'?'PACIFIC OCEAN':label==='Lesser Antilles'?'CARIBBEAN SEA':label==='Indian Ocean islands'?'INDIAN OCEAN':'ISLAND REGION'}</text>
    {coords.map(({number,name,center})=>{
     const {x,y}=project(center);
     return <g key={number} transform={`translate(${x},${y})`} className="location-atlas-pin" role={result?undefined:'button'} tabIndex={result?undefined:0} aria-label={`Choose marker ${number} at ${coordinate(center[1],'N','S')}, ${coordinate(center[0],'E','W')}`}
      onClick={result?undefined:()=>choose(number,false)}
      onKeyDown={result?undefined:event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(number,false);}}}>
      <circle r="25" fill="none" stroke="#c18e35" strokeWidth="4" strokeDasharray="8 5"/>
      <circle r="15" fill="#f2e5aa" stroke="#214557" strokeWidth="2"/>
      <text y="1" textAnchor="middle" dominantBaseline="central" fontSize="23" fontWeight="800" fill="#173e58">{number}</text>
     </g>;
    })}
   </svg>
  </section>;
 };
 const renderMaps=inDialog=><div className={`location-frame${split?' location-atlas-layout':''}`}>
  {label&&<p className="location-inset-label">{split?'Find the islands — magnified view':label+' — enlarged view'}</p>}
  {split?<div className="location-atlas-scene">
    {renderLocator()}
    <div className="location-magnifier" aria-label="Magnified island candidates">
     <div className="location-magnifier-glass">
      {panels.map((panel,index)=><div className="location-magnifier-part" key={index}>{paint(inDialog,panel,index)}</div>)}
     </div>
     <div className="location-magnifier-handle" aria-hidden="true"/>
    </div>
    <p className="location-lens-note">The map shows where each island is located. The magnifier shows their shapes enlarged; each close-up has its own scale.</p>
   </div>:panels.map((panel,index)=>paint(inDialog,panel,index))}
 </div>;
 function choose(number,inDialog){
  if(inDialog)dialog.current?.close();
  onChoose(number);
 }
 const controls=<div className="location-controls" aria-label="Map zoom and navigation controls">
  <div className="location-zoom-actions">
   <button type="button" onClick={()=>zoom(1.6)} disabled={zoomLevel>=4.95} aria-label="Zoom map in">+ Zoom in</button>
   <button type="button" onClick={()=>zoom(1/1.6)} disabled={isFull} aria-label="Zoom map out">− Zoom out</button>
   <button type="button" onClick={focusChoices}>Focus on markers</button>
   <button type="button" onClick={reset} disabled={isFull}>{label?(split?'Full close-ups':'Full inset'):'Full map'}</button>
   {hasInset&&<button type="button" onClick={()=>changeView(!continent)}>{continent?'Return to enlarged view':'Continental map'}</button>}
   {hasExtent&&<button type="button" aria-pressed={extent} onClick={()=>changeView(false,!extent)}>{extent?'Show island details':'Show wider island groups'}</button>}
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
 return <>{renderMaps(false)}
  {continent&&<p className="location-scale">Continental overview. Return to the enlarged view to see the numbered arrows.</p>}
  {children}
  {controls}
  <button ref={opener} type="button" className="subtle location-zoom" onClick={()=>{setEnlarged(true);dialog.current?.showModal();}}>⌕ Enlarge map</button>
  <dialog className="landscape-lens location-dialog" ref={dialog} aria-label="Enlarged geography map" onClose={()=>{setEnlarged(false);opener.current?.focus();}}>
   <button type="button" className="close-lens" autoFocus onClick={()=>dialog.current?.close()}>Close map ×</button>
   {enlarged&&<>{renderMaps(true)}{controls}</>}
  </dialog>
 </>;
}


function coordinate(value,positive,negative){
 return Math.abs(value).toFixed(1)+'° '+(value>=0?positive:negative);
}
function formatScale(widthKm){
 return widthKm<1?Math.round(widthKm*1000)+' m':Math.round(widthKm)+' km';
}
