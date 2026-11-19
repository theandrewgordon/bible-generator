// Keep numbered answer badges outside the geographic artwork; arrows alone
// enter the map. Work in viewBox coordinates so zoom/pan and dialogs remain aligned.
export function layoutMarkerCallouts(viewport,markers){
 const [left,top,width,height]=viewport;
 const radius=width*.03;
 const gutter=radius*3.3;
 const padding=radius*1.35;
 const mid=left+width/2;
 const visible=markers.filter(({x,y})=>x>=left && x<=left+width && y>=top && y<=top+height);
 const groups={left:[],right:[]};
 for(const marker of visible)groups[marker.x<mid?'left':'right'].push(marker);
 const output=[];
 for(const side of ['left','right']){
  const group=groups[side].sort((a,b)=>a.y-b.y);
  const min=top+padding,max=top+height-padding,spacing=radius*2.55;
  const coords=group.map(({y})=>Math.max(min,Math.min(max,y)));
  for(let i=1;i<coords.length;i++)coords[i]=Math.max(coords[i],coords[i-1]+spacing);
  const overflow=coords.length?Math.max(0,coords[coords.length-1]-max):0;
  for(let i=0;i<coords.length;i++)coords[i]-=overflow;
  const labelX=side==='left'?left-gutter*.55:left+width+gutter*.55;
  for(let i=0;i<group.length;i++){
   const marker=group[i];
   const badge={x:labelX,y:coords[i]};
   // A thin line and tiny arrowhead indicate the location precisely;
   // the numbered badge itself never overlaps landforms.
   const vx=marker.x-badge.x,vy=marker.y-badge.y;
   const length=Math.hypot(vx,vy)||1,ux=vx/length,uy=vy/length;
   const start={x:badge.x+ux*radius,y:badge.y+uy*radius};
   const tip={x:marker.x,y:marker.y};
   const arrow=radius*.28,half=radius*.16;
   const back={x:tip.x-ux*arrow,y:tip.y-uy*arrow};
   const arrowPoints=[
    [tip.x,tip.y],
    [back.x-uy*half,back.y+ux*half],
    [back.x+uy*half,back.y-ux*half],
   ].map(point=>point.join(',')).join(' ');
   output.push({...marker,side,badge,start,tip,arrowPoints,radius});
  }
 }
 return {gutter,radius,callouts:output};
}
