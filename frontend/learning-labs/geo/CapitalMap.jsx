import React,{useId} from 'react';

const pigments = [
 ['#2c8c84','#acd5a8','#edca80'],
 ['#428fb8','#a5dbe0','#7eb79b'],
 ['#6275a8','#c9b0d7','#f3cd9f'],
 ['#ae7354','#e3bd74','#d1d496'],
 ['#498e66','#a7ca93','#f4d191'],
 ['#a25872','#e8b2ad','#f1d394'],
];

const star = Array.from({length:10},(_, index)=>{
 const angle = index*Math.PI/5-Math.PI/2;
 const radius = index%2 ? 5.6 : 13;
 return [Math.cos(angle)*radius,Math.sin(angle)*radius].join(',');
}).join(' ');

export function CapitalMap({map}) {
 const uid = useId();
 const ref = part=>`url(#${uid}-${part})`;
 // The outline seeds the color and placement of the washes for this map.
 const seed = [...map.outline].reduce((hash,char)=>(Math.imul(hash,31)+char.charCodeAt(0))>>>0,1);
 const [deep,light,warm] = map.marker ? pigments[seed%pigments.length] : pigments[1];
 return <svg className="landscape capital-map" viewBox="0 0 600 380" role="img"
  aria-label={map.marker?'Watercolor outline with a star at the city’s location':'Watercolor outline of Antarctica'} xmlns="http://www.w3.org/2000/svg">
  <defs>
   <linearGradient id={uid+'-wash'} gradientTransform={`rotate(${seed%160} .5 .5)`}>
    <stop stopColor={light}/>
    <stop offset=".56" stopColor={deep}/>
    <stop offset="1" stopColor={warm}/>
   </linearGradient>
   <radialGradient id={uid+'-bloom'}>
    <stop stopColor={light} stopOpacity=".88"/>
    <stop offset=".65" stopColor={warm} stopOpacity=".35"/>
    <stop offset="1" stopColor={warm} stopOpacity="0"/>
   </radialGradient>
   <clipPath id={uid+'-outline'}><path d={map.outline} clipRule="evenodd"/></clipPath>
   <filter id={uid+'-grain'} x="0%" y="0%" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".52" numOctaves="3" seed={seed%1021}/>
    <feColorMatrix type="saturate" values="0"/>
   </filter>
   <filter id={uid+'-pigment'} x="0%" y="0%" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="5" seed={seed%1021}/>
    <feColorMatrix type="saturate" values="0"/>
   </filter>
  </defs>
  <rect width="600" height="380" fill="#fbf2dd"/>
  <rect width="600" height="380" filter={ref('grain')} opacity=".12" style={{mixBlendMode:'multiply'}}/>
  <path d={map.outline} fill="none" stroke={deep} opacity=".16" strokeWidth="8" strokeLinejoin="round"/>
  <g clipPath={ref('outline')}>
   <path d={map.outline} fill={ref('wash')} fillRule="evenodd"/>
   {[0,1,2,3].map(index=><ellipse key={index} cx={146+(seed>>>(index*5))%308}
    cy={75+((seed>>>(index*6+2))%220)} rx={110+index*7} ry={58+index*13} fill={ref('bloom')}/>)}
   <rect width="600" height="380" filter={ref('pigment')} opacity=".5" style={{mixBlendMode:'soft-light'}}/>
   <rect width="600" height="380" filter={ref('grain')} opacity=".27" style={{mixBlendMode:'multiply'}}/>
  </g>
  <path d={map.outline} fill="none" stroke={deep} opacity=".85" strokeWidth="1.7" strokeLinejoin="round"/>
  {map.marker&&<polygon points={star} transform={`translate(${map.marker.join(' ')})`}
   fill="#ffcf52" stroke="#56381d" strokeWidth="2.2" strokeLinejoin="round"/>}
 </svg>;
}
