// Viewport math shared by the inline and enlarged Find It on the Map views.
// Coordinates use the same SVG viewBox units as the geography data.
export const regionViews = {
 'north-america': [
  {name:'Caribbean',center:[681,443],scale:3.1},
  {name:'Central America',center:[505,455],scale:3.1},
 ],
 usa:[
  {name:'Northeast',center:[806,260],scale:2.4},
  {name:'Southeast',center:[755,410],scale:2.4},
  {name:'West',center:[285,320],scale:2.1},
 ],
 europe:[
  {name:'Western Europe',center:[333,409],scale:2.3},
  {name:'Eastern Europe',center:[625,343],scale:2.2},
 ],
 africa:[
  {name:'West Africa',center:[385,291],scale:2.2},
  {name:'East Africa',center:[650,325],scale:2.2},
 ],
 asia:[
  {name:'Southeast Asia',center:[647,445],scale:2.5},
  {name:'East Asia',center:[704,287],scale:2.1},
 ],
 'south-america':[
  {name:'Andes',center:[421,325],scale:2.1},
 ],
 australia:[
  {name:'Pacific Islands',center:[641,265],scale:2.3},
 ],
};
export function clampViewport(base,next){
 const [bx,by,bw,bh]=base;
 const w=Math.max(bw/5,Math.min(bw,next[2]));
 const h=w*bh/bw;
 const x=Math.max(bx,Math.min(bx+bw-w,next[0]));
 const y=Math.max(by,Math.min(by+bh-h,next[1]));
 return [x,y,w,h];
}
export function centeredViewport(base,center,scale){
 const width=base[2]/scale,height=base[3]/scale;
 return clampViewport(base,[center[0]-width/2,center[1]-height/2,width,height]);
}
export function scaledViewport(base,current,multiplier){
 return centeredViewport(base,[current[0]+current[2]/2,current[1]+current[3]/2],base[2]/current[2]*multiplier);
}
export function shiftedViewport(base,current,dx,dy){
 return clampViewport(base,[current[0]+current[2]*dx,current[1]+current[3]*dy,current[2],current[3]]);
}
export function markersViewport(base,markers){
 if(!markers.length)return base;
 const xs=markers.map(pin=>pin.x),ys=markers.map(pin=>pin.y);
 const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
 const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
 const zoom=Math.min(4.8,Math.max(1,Math.min(base[2]/(spanX+145),base[3]/(spanY+115))));
 return centeredViewport(base,center,zoom);
}

/**
 * Open each question at the closest useful view without hiding answer choices.
 * A named regional view is preferred when all markers safely fit in it; otherwise
 * frame the three markers directly. Leave the full map for widely separated choices.
 */
export function initialMapViewport(base,markers,branch){
 const focus=markersViewport(base,markers);
 const presets=regionViews[branch]||[];
 const fits=(view,padding=40)=>markers.every(({x,y})=>
  x>=view[0]+padding && x<=view[0]+view[2]-padding &&
  y>=view[1]+padding && y<=view[1]+view[3]-padding);
 const regional=presets.map(preset=>centeredViewport(base,preset.center,preset.scale))
  .filter(view=>fits(view))
  .sort((a,b)=>a[2]-b[2])[0];
 // Keep all three tappable markers in frame. Regional shortcuts are optional,
 // while the actual question markers are the primary focus.
 if(regional && regional[2]<focus[2])return regional;
 return focus;
}
