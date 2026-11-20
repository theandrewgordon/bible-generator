import test from 'node:test';
import assert from 'node:assert/strict';
import {questionGeography,locationQuestions} from '../geo/locations.js';
import {initialMapViewport,markersViewport,scaledViewport,shiftedViewport} from '../geo/map-viewport.js';
import {layoutMarkerCallouts} from '../geo/marker-callouts.js';

test('numbered geography badges never cover the map or each other',()=>{
 for(const question of locationQuestions){
  const map=questionGeography(question);
  for(const panel of map.panels){
   const markers=panel.numbered;
   const start=map.hasInset?map.view:initialMapViewport(map.view,markers,question.branch);
   const zoom=scaledViewport(map.view,start,1.6);
   const pan=shiftedViewport(map.view,zoom,.12,-.13);
   for(const viewport of [map.view,start,markersViewport(map.view,markers),zoom,pan]){
   const {callouts,radius,gutter}=layoutMarkerCallouts(viewport,markers,map.panels.length>1?.06:.03);
   const [left,top,w,h]=viewport;
   assert.equal(callouts.length,markers.filter(pin=>pin.x>=left&&pin.x<=left+w&&pin.y>=top&&pin.y<=top+h).length);
   assert.ok(gutter>radius*2,question.id+' has enough margin');
   for(const badge of callouts){
    assert.equal(badge.tip.x,badge.x,question.id+' arrow ends on correct longitude position');
    assert.equal(badge.tip.y,badge.y,question.id+' arrow ends on correct latitude position');
    if(badge.side==='left')assert.ok(badge.badge.x+radius<viewport[0],question.id+' badge overlaps map');
    else assert.ok(badge.badge.x-radius>viewport[0]+viewport[2],question.id+' badge overlaps map');
   }
   for(let i=0;i<callouts.length;i++)for(let j=i+1;j<callouts.length;j++){
    const a=callouts[i],b=callouts[j];
    assert.ok(Math.hypot(a.badge.x-b.badge.x,a.badge.y-b.badge.y)>=2*radius,
      question.id+' has overlapping numbered labels');
   }
   }
  }
 }
});
