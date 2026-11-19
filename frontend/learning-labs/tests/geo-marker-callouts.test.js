import test from 'node:test';
import assert from 'node:assert/strict';
import {locationMaps,locationQuestions} from '../geo/locations.js';
import {initialMapViewport,markersViewport} from '../geo/map-viewport.js';
import {layoutMarkerCallouts} from '../geo/marker-callouts.js';

test('numbered geography badges never cover the map or each other',()=>{
 for(const question of locationQuestions){
  const map=locationMaps[question.branch];
  const markers=question.locations.map((name,index)=>{
   const [,x,y]=map.points[name];
   return {x,y,number:String(index+1)};
  });
  for(const viewport of [map.view,initialMapViewport(map.view,markers,question.branch),markersViewport(map.view,markers)]){
   const {callouts,radius,gutter}=layoutMarkerCallouts(viewport,markers);
   assert.equal(callouts.length,3,question.id+' keeps all three answer labels');
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
});
