import test from 'node:test';
import assert from 'node:assert/strict';
import {locationQuestions,locationMaps} from '../geo/locations.js';
import {regionViews,centeredViewport,scaledViewport,shiftedViewport,markersViewport} from '../geo/map-viewport.js';

function inside(view,point){
 return point.x>=view[0]-1e-7 && point.x<=view[0]+view[2]+1e-7 &&
        point.y>=view[1]-1e-7 && point.y<=view[1]+view[3]+1e-7;
}
test('regional shortcuts remain within geographic map boundaries',()=>{
 for(const [branch,presets] of Object.entries(regionViews)){
  assert.ok(locationMaps[branch],branch+' has map');
  const full=locationMaps[branch].view;
  for(const preset of presets){
   const zoomed=centeredViewport(full,preset.center,preset.scale);
   assert.ok(zoomed[2]<full[2],branch+' '+preset.name+' zooms in');
   assert.ok(inside(full,{x:zoomed[0],y:zoomed[1]}),preset.name+' top-left');
   assert.ok(inside(full,{x:zoomed[0]+zoomed[2],y:zoomed[1]+zoomed[3]}),preset.name+' bottom-right');
  }
 }
 assert.ok(regionViews['north-america'].some(region=>region.name==='Caribbean'));
 assert.ok(regionViews['north-america'].some(region=>region.name==='Central America'));
});
test('focus on markers keeps all three answer choices visible for every geography question',()=>{
 for(const question of locationQuestions){
  const map=locationMaps[question.branch];
  const pins=question.locations.map(name=>{
   const point=map.points[name];
   return {x:point[1],y:point[2]};
  });
  const focused=markersViewport(map.view,pins);
  for(const pin of pins) assert.ok(inside(focused,pin),question.id+' missing a marker in focused view');
 }
});
test('map zoom and pan clamp to full map bounds',()=>{
 const full=[0,0,1000,620];
 const zoomed=centeredViewport(full,[900,600],4);
 assert.deepEqual(scaledViewport(full,zoomed,0.25),full);
 const moved=shiftedViewport(full,zoomed,100,100);
 assert.ok(inside(full,{x:moved[0]+moved[2],y:moved[1]+moved[3]}));
});
