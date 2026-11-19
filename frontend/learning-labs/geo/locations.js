import maps from './location-map-data.json' with {type:'json'};
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
const tinyLocations=Object.fromEntries(`asia|Bahrain|230.6|379.4
asia|Maldives|400|476.1
asia|Singapore|589.8|476.4
africa|Cape Verde|187.1|205.3
africa|Comoros|698|415.9
africa|Mauritius|798.3|476.6
africa|Seychelles|780.4|359.3
africa|São Tomé and Príncipe|419.8|317.4
europe|Andorra|267|459
europe|Liechtenstein|415.4|387.7
europe|Malta|459|525.9
europe|Monaco|385.8|430.1
europe|San Marino|444.3|430.1
europe|Vatican City|429|468
north-america|Antigua and Barbuda|705.1|440.6
north-america|Barbados|724.4|461.2
north-america|Dominica|710.3|449.2
north-america|Grenada|713.1|466.5
north-america|Saint Kitts and Nevis|698.9|439
north-america|Saint Lucia|714.7|457.3
north-america|Saint Vincent and the Grenadines|714.3|460.6
australia|Kiribati|650.6|138
australia|Marshall Islands|610|72.1
australia|Micronesia|518|143
australia|Nauru|598.4|151.6
australia|Palau|324.7|69.2
australia|Samoa|725|322
australia|Tonga|715|351
australia|Tuvalu|690.8|219.4`.split('\n').map(line=>{
 const [branch,name,x,y]=line.split('|');
 return [branch+':'+name,[Number(x),Number(y)]];
}));

/* Most map outlines contain a dominant mainland ring. Its central area provides
   an initial pin for places without a curated map coordinate. */
function shapeCenter(path){
 if(!path)return null;
 // Evaluate each closed ring and choose a point inside the largest landmass.
 // Bounding-box centers can land in lakes, neighboring states, or the ocean.
 const rings=path.split(/(?=M[\d.-])/).filter(Boolean);
 const shapes=rings.map(ring=>{
  const vertices=[...ring.matchAll(/[ML](-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
   .map(m=>[Number(m[1]),Number(m[2])]);
  if(vertices.length<3)return null;
  let twiceArea=0,cx=0,cy=0;
  for(let i=0;i<vertices.length;i++){
   const [ax,ay]=vertices[i],[bx,by]=vertices[(i+1)%vertices.length];
   const cross=ax*by-bx*ay;
   twiceArea+=cross;
   cx+=(ax+bx)*cross;
   cy+=(ay+by)*cross;
  }
  if(Math.abs(twiceArea)<0.001)return null;
  return {vertices,area:Math.abs(twiceArea)/2,center:[cx/(3*twiceArea),cy/(3*twiceArea)]};
 }).filter(Boolean).sort((a,b)=>b.area-a.area);
 if(!shapes.length)return null;
 const {vertices,center}=shapes[0];
 function inside(x,y){
  let found=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
   const a=vertices[i],b=vertices[j];
   if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])found=!found;
  }
  return found;
 }
 if(inside(...center))return center.map(value=>Math.round(value*10)/10);
 const xs=vertices.map(v=>v[0]),ys=vertices.map(v=>v[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 // For a concave border, search toward the center at several scales.
 let best=null,score=Infinity;
 for(let iy=1;iy<20;iy++)for(let ix=1;ix<20;ix++){
  const x=minX+(maxX-minX)*ix/20,y=minY+(maxY-minY)*iy/20;
  if(!inside(x,y))continue;
  const distance=(x-center[0])**2+(y-center[1])**2;
  if(distance<score){best=[x,y];score=distance;}
 }
 return (best||vertices[0]).map(value=>Math.round(value*10)/10);
}

export const completeLocationRows=Object.fromEntries(Object.entries(capitalMapData)
 .filter(([branch])=>branch!=='antarctica')
 .map(([branch,rows])=>[branch,rows.map(([id,name,capital])=>({
  name,capital,code:branch==='usa'?id.slice(6):numericCodes[id.slice(8)],
 }))]));

export const locationMaps=Object.fromEntries(Object.entries(maps).map(([branch,map])=>{
 const points={...map.points};
 for(const row of completeLocationRows[branch]||[]){
  if(points[row.name])continue;
  const fallback=tinyLocations[branch+':'+row.name];
  const id=row.code&&map.paths[row.code]?row.code:null;
  const pt=id?shapeCenter(map.paths[id]):fallback;
  if(!pt)continue;
  points[row.name]=[id||'tiny-'+row.name,...pt];
 }
 return [branch,{...map,points}];
}));

export const locationQuestions=Object.entries(completeLocationRows).flatMap(([branch,rows])=>{
 const entries=cluesByRegion[branch]||{};
 const places=rows.map(row=>row.name).filter(name=>locationMaps[branch].points[name]);
 return places.map((target,index)=>{
  const correctIndex=(index+1)%3;
  const point=name=>locationMaps[branch].points[name];
  const distance=(a,b)=>Math.hypot(point(a)[1]-point(b)[1],point(a)[2]-point(b)[2]);
  const locations=[target];
  // Numbered locator circles have a 27-unit radius. Keep their centers apart
  // so small neighboring countries and states remain independently tappable.
  const candidates=places.slice(index+7).concat(places.slice(0,index+7))
   .filter(name=>name!==target);
  for(const name of candidates){
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
   const [,x,y]=point(target);
   const [,ox,oy]=point(other);
   const dx=x-ox,dy=y-oy;
   if(Math.abs(dx)>Math.abs(dy)*1.5)return dx>0?'east':'west';
   if(Math.abs(dy)>Math.abs(dx)*1.5)return dy>0?'south':'north';
   return (dy>0?'south':'north')+(dx>0?'east':'west');
  };
  const otherMarkers=locations.map((name,i)=>({name,marker:i+1})).filter(item=>item.name!==target);
  const clues=entries[target]||[
   `Find ${branch==='usa'?'the state of':'the country'} ${target} on the map.`,
   `Look ${relativeDirection(otherMarkers[0].name)} of marker ${otherMarkers[0].marker} on this map.`,
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
