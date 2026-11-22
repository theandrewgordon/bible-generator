import maps from './location-map-data.json' with {type:'json'};
import closeups from './location-insets.json' with {type:'json'};
import {capitalMapData} from './capital-map-data.js';

export const locationTrailName = 'Find it on the Map';

const cluesByRegion = {
 usa:{
  Iowa:['Look in the Midwest, in the middle of the country.','Look east of Nebraska and north of Missouri.','The Mississippi River runs along my eastern edge.'],
  Nebraska:['Look in the middle of the country.','Look just north of Kansas.','Iowa is just across the Missouri River to my east.'],
  Kansas:['Look in the broad plains in the middle of the country.','Look directly below Nebraska.','I’m between Colorado to the west and Missouri to the east.'],
  Minnesota:['Look in the upper Midwest.','I touch Canada and Lake Superior.','I’m directly north of Iowa.'],
 },
 'north-america':{
  Canada:['Look toward the top of the map.','My shores touch the Arctic, Atlantic, and Pacific oceans.','I’m directly north of most of the United States.'],
  'United States':['Look for a country with both Atlantic and Pacific shores.','Most of my states are between Canada and Mexico.','Alaska and Hawaii are also part of me.'],
  Mexico:['Look where the continent gets narrower toward the south.','I touch both the Pacific Ocean and the Gulf of Mexico.','I’m just south of the United States.'],
  Cuba:['Look in the Caribbean Sea.','I’m a long island south of Florida.','I’m east of Mexico’s Yucatán Peninsula.'],
 },
 'south-america':{
  Brazil:['Look for the biggest country on this map.','The Amazon River flows across my north.','I take up much of the eastern side of South America.'],
  Argentina:['Look toward the southern end of the continent.','The Andes run along much of my western edge.','I’m just east of Chile.'],
  Peru:['Look along the Pacific coast, on the west.','The Andes run through my land.','I’m south of Ecuador and north of Chile.'],
  Colombia:['Look in the northwest of the continent.','My coast touches both the Pacific Ocean and the Caribbean Sea.','Panama meets South America at my border.'],
 },
 europe:{
  France:['Look in western Europe.','The English Channel is along my northern coast.','I’m north of Spain and west of Germany.'],
  Spain:['Look in the southwest corner of Europe.','I share a peninsula with Portugal.','The Pyrenees help separate me from France.'],
  Italy:['Look for a country that reaches into the Mediterranean Sea.','Part of my mainland looks like a boot.','Sicily sits near the toe of that boot.'],
  Germany:['Look in central Europe.','I touch the North Sea and the Baltic Sea.','I’m east of France and west of Poland.'],
 },
 africa:{
  Egypt:['Look in northeastern Africa.','The Nile River flows north through me.','I’m east of Libya and north of Sudan.'],
  Nigeria:['Look in West Africa.','My southern coast faces the Gulf of Guinea.','I’m directly west of Cameroon and south of Niger.'],
  Kenya:['Look in eastern Africa near the equator.','My coast faces the Indian Ocean.','I’m north of Tanzania and south of Ethiopia.'],
  'South Africa':['Look at the lower end of the continent.','I have coasts on the Atlantic and Indian oceans.','The small country of Lesotho is entirely inside my borders.'],
 },
 asia:{
  China:['Look for a large country in eastern Asia.','Mongolia is to my north.','I’m north of Vietnam and west of Korea.'],
  India:['Look in southern Asia.','The Himalayas rise along part of my northern edge.','I reach into the Indian Ocean, just north of Sri Lanka.'],
  Japan:['Look just off the eastern edge of mainland Asia.','I’m a chain of islands in the Pacific Ocean.','The Sea of Japan lies between my islands and Korea.'],
  'Saudi Arabia':['Look in southwestern Asia.','The Red Sea lies along my western coast.','I cover most of the Arabian Peninsula.'],
 },
 australia:{
  Australia:['Look for the largest landmass on this map.','I’m south of Papua New Guinea.','New Zealand is across the Tasman Sea to my southeast.'],
  'New Zealand':['Look southeast of Australia.','Two long islands make up most of my land.','The Tasman Sea is between me and Australia.'],
  'Papua New Guinea':['Look just north of Australia.','I share a large island with Indonesia.','I’m on the eastern half of that island.'],
  Fiji:['Look out in the Pacific, east of Australia.','I’m a group of islands well north of New Zealand.','I’m east of Vanuatu and west of Tonga.'],
 },
};


/* Build the complete location trail from the same canonical jurisdiction rows
   used for the capital trail. This prevents capitals and map questions drifting. */
const numericCodes=Object.fromEntries(`af:004 am:051 az:031 bh:048 bd:050 bt:064 bn:096 kh:116 cn:156 cy:196 ge:268 in:356 id:360 ir:364 iq:368 il:376 jp:392 jo:400 kz:398 kw:414 kg:417 la:418 lb:422 my:458 mv:462 mn:496 mm:104 np:524 kp:408 om:512 pk:586 ps:275 ph:608 qa:634 sa:682 sg:702 kr:410 lk:144 sy:760 tj:762 th:764 tl:626 tm:795 tr:792 ae:784 uz:860 vn:704 ye:887 dz:012 ao:024 bj:204 bw:072 bf:854 bi:108 cm:120 cv:132 cf:140 td:148 km:174 cg:178 cd:180 dj:262 eg:818 gq:226 er:232 sz:748 et:231 ga:266 gm:270 gh:288 gn:324 gw:624 ci:384 ke:404 ls:426 lr:430 ly:434 mg:450 mw:454 ml:466 mr:478 mu:480 ma:504 mz:508 na:516 ne:562 ng:566 rw:646 sn:686 sc:690 sl:694 so:706 za:710 ss:728 sd:729 st:678 tz:834 tg:768 tn:788 ug:800 zm:894 zw:716 al:008 ad:020 at:040 by:112 be:056 ba:070 bg:100 hr:191 cz:203 dk:208 ee:233 fi:246 fr:250 de:276 gr:300 hu:348 is:352 ie:372 it:380 lv:428 li:438 lt:440 lu:442 mt:470 md:498 mc:492 me:499 nl:528 mk:807 no:578 pl:616 pt:620 ro:642 ru:643 sm:674 rs:688 sk:703 si:705 es:724 se:752 ch:756 ua:804 gb:826 va:336 ar:032 bo:068 br:076 cl:152 co:170 ec:218 gy:328 py:600 pe:604 sr:740 uy:858 ve:862 ag:028 bs:044 bb:052 bz:084 ca:124 cr:188 cu:192 dm:212 do:214 sv:222 gd:308 gt:320 ht:332 hn:340 jm:388 mx:484 ni:558 pa:591 kn:659 lc:662 vc:670 tt:780 us:840 au:036 fj:242 ki:296 mh:584 fm:583 nr:520 nz:554 pw:585 pg:598 ws:882 sb:090 to:776 tv:798 vu:548`.split(' ').map(pair=>pair.split(':')));
function vertices(ring){
 return [...ring.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
  .map(m=>[Number(m[1]),Number(m[2])]);
}
function insideRing(ring,x,y){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function pointOnFeature(path,x,y){
 return !!path&&path.split('M').slice(1).reduce((inside,ring)=>inside!==insideRing(vertices('M'+ring),x,y),false);
}

/* Most map outlines contain a dominant mainland ring. Its central area provides
   an initial pin for places without a curated map coordinate. */
function shapeCenter(path){
 if(!path)return null;
 // Evaluate each closed ring and choose a point inside the largest landmass.
 // Bounding-box centers can land in lakes, neighboring states, or the ocean.
 const rings=path.split(/(?=M[\d.-])/).filter(Boolean);
 const shapes=rings.map(ring=>{
  const points=vertices(ring);
  if(points.length<3)return null;
  let twiceArea=0,cx=0,cy=0;
  for(let i=0;i<points.length;i++){
   const [ax,ay]=points[i],[bx,by]=points[(i+1)%points.length];
   const cross=ax*by-bx*ay;
   twiceArea+=cross;
   cx+=(ax+bx)*cross;
   cy+=(ay+by)*cross;
  }
  if(Math.abs(twiceArea)<0.001)return null;
  return {vertices:points,area:Math.abs(twiceArea)/2,center:[cx/(3*twiceArea),cy/(3*twiceArea)]};
 }).filter(Boolean).sort((a,b)=>b.area-a.area);
 if(!shapes.length)return null;
 const {vertices:outline,center}=shapes[0];
 const inside=(x,y)=>pointOnFeature(path,x,y);
 if(inside(...center))return center.map(value=>Math.round(value*10)/10);
 const xs=outline.map(v=>v[0]),ys=outline.map(v=>v[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 // For a concave border, search toward the center at several scales.
 let best=null,score=Infinity;
 for(let iy=1;iy<20;iy++)for(let ix=1;ix<20;ix++){
  const x=minX+(maxX-minX)*ix/20,y=minY+(maxY-minY)*iy/20;
  if(!inside(x,y))continue;
  const distance=(x-center[0])**2+(y-center[1])**2;
  if(distance<score){best=[x,y];score=distance;}
 }
 return (best||outline[0]).map(value=>Math.round(value*10)/10);
}

export const completeLocationRows=Object.fromEntries(Object.entries(capitalMapData)
 .filter(([branch])=>branch!=='antarctica')
 .map(([branch,rows])=>[branch,rows.map(([id,name,capital])=>({
  name,capital,code:branch==='usa'?id.slice(6):numericCodes[id.slice(8)],
 }))]));

export const locationMaps=Object.fromEntries(Object.entries(maps).map(([branch,map])=>{
 const points={...map.points};
 for(const row of completeLocationRows[branch]||[]){
  const original=points[row.name];
  if(original&&pointOnFeature(map.paths[original[0]],original[1],original[2]))continue;
  const id=original?.[0]??(map.paths[row.code]?row.code:null);
  const pt=id?shapeCenter(map.paths[id]):null;
  if(!pt)continue;
  points[row.name]=[id,...pt];
 }
 return [branch,{...map,points}];
}));

export const locationQuestions=Object.entries(completeLocationRows).flatMap(([branch,rows])=>{
 const entries=cluesByRegion[branch]||{};
 // Keep Kiribati out of this introductory map trail and its distractors.
 // Other geography/capital data remains unchanged.
 const playableRows=rows.filter(row=>row.name!=='Kiribati');
 const places=playableRows.map(row=>row.name);
 return playableRows.map((target,index)=>{
  const correctIndex=(index+1)%3;
  const point=name=>locationMaps[branch].points[name];
  const distance=(a,b)=>Math.hypot(point(a)[1]-point(b)[1],point(a)[2]-point(b)[2]);
  const locations=[target];
  // Continental choices need enough separation to read the arrow tips clearly.
  const inset=closeups[target];
  const candidates=places.slice(index+7).concat(places.slice(0,index+7))
   .filter(name=>name!==target&&!closeups[name]);
  if(inset)locations.push(...inset.nearby.filter(name=>name!=='Kiribati').slice(0,2));
  for(const name of inset?[]:candidates){
   if(locations.every(other=>distance(name,other)>=68))locations.push(name);
   if(locations.length===3)break;
  }
  // In exceptionally crowded map regions, prefer the farthest remaining point.
  while(locations.length<3){
   const best=candidates.filter(name=>!locations.includes(name))
    .sort((a,b)=>Math.min(...locations.map(x=>distance(b,x)))-Math.min(...locations.map(x=>distance(a,x))))[0];
   if(!best)break;
   locations.push(best);
  }
  locations.splice(0,locations.length,...[
   ...locations.filter(name=>name!==target).slice(0,correctIndex),
   target,
   ...locations.filter(name=>name!==target).slice(correctIndex),
  ]);
  const answer=String(correctIndex+1);
  const row=rows.find(row=>row.name===target);
  // Use the actual numbered map markers for useful, testable clues.
  // Generic region hints did not help children distinguish three choices.
  const relativeDirection=(other)=>{
   if(inset&&!inset.shared){
    const [lon,lat]=inset.center;
    const [otherLon,otherLat]=closeups[other].center;
    const deltaLon=(lon-otherLon+540)%360-180;
    const deltaLat=lat-otherLat;
    return Math.abs(deltaLat)>=2||!deltaLon?(deltaLat>0?'north':'south'):(deltaLon>0?'east':'west');
   }
   const [,x,y]=inset?.shared?inset.shared.points[inset.code]:point(target);
   const [,ox,oy]=inset?.shared?inset.shared.points[closeups[other].code]:point(other);
   const dx=x-ox,dy=y-oy;
   if(Math.abs(dx)>Math.abs(dy)*1.5)return dx>0?'east':'west';
   if(Math.abs(dy)>Math.abs(dx)*1.5)return dy>0?'south':'north';
   return (dy>0?'south':'north')+(dx>0?'east':'west');
  };
  const otherMarkers=locations.map((name,i)=>({name,marker:i+1})).filter(item=>item.name!==target);
  const clues=entries[target]||[
   `Find ${branch==='usa'?'the state of':'the country'} ${target} on the map.`,
   inset&&!inset.shared
    ? `Compare the coordinates below the maps. Look ${relativeDirection(otherMarkers[0].name)} of marker ${otherMarkers[0].marker}.`
    : `Look ${relativeDirection(otherMarkers[0].name)} of marker ${otherMarkers[0].marker} on this map.`,
   `Now look ${relativeDirection(otherMarkers[1].name)} of marker ${otherMarkers[1].marker}. ${target}'s capital is ${row.capital}.`,
  ];
  return {
   id:'location-'+target.toLowerCase().replaceAll(' ','-')+'-'+branch,
   branch,place:locationTrailName,topic:locationTrailName,target,locations,
   choices:['1','2','3'],answer,clues,
   explanation:`Marker ${answer} shows ${target}. ${entries[target]?clues[2]:`Its capital is ${row.capital}.`}`,
  };
 });
});

const insetView=[0,0,800,620];
export function questionGeography(question,{continent=false,extent=false}={}){
 const parent=locationMaps[question.branch];
 const inset=closeups[question.target];
 const pins=(point,places)=>places.map(name=>{
  const [id,x,y]=point(name);
  return {id,x,y,number:question.choices[question.locations.indexOf(name)]};
 });
 if(!inset||continent){
  return {view:parent.view,hasInset:!!inset,panels:[{paths:parent.paths,
   numbered:inset?[]:pins(name=>parent.points[name],question.locations)}]};
 }
 const hasExtent=question.locations.some(name=>!!closeups[name].overview);
 if(inset.shared&&!extent){
  const {paths,points,widthKm}=inset.shared;
  return {view:insetView,hasInset:true,label:inset.label,hasExtent,panels:[{paths,widthKm,
   numbered:pins(name=>points[closeups[name].code],question.locations)}]};
 }
 return {view:insetView,hasInset:true,label:inset.label,
  hasExtent,
  panels:question.locations.map(name=>{
   const {code,center,overview,detail}=closeups[name];
   const {paths,points,widthKm}=extent&&overview?overview:detail;
   return {paths,center,widthKm,numbered:pins(()=>points[code],[name])};
  })};
}
