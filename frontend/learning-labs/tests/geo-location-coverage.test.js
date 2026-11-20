import test from 'node:test';
import assert from 'node:assert/strict';
import {capitalMapData} from '../geo/capital-map-data.js';
import {locationQuestions,completeLocationRows,questionGeography,pointOnFeature} from '../geo/locations.js';
import {capitalQuestions} from '../geo/capitals.js';

const regions=['usa','north-america','south-america','europe','africa','asia','australia'];
const expected={usa:50,'north-america':23,'south-america':12,europe:44,africa:54,asia:48,australia:14};

test('every state and country has one corresponding capital question',()=>{
 const ids=new Set(capitalQuestions.map(item=>item.id));
 for(const branch of regions){
  const rows=capitalMapData[branch];
  assert.equal(rows.length,expected[branch],branch+' expected count');
  assert.equal(new Set(rows.map(row=>row[1])).size,rows.length,branch+' unique names');
  for(const [id,name,capital] of rows){
   assert.ok(ids.has(id),'Missing capital question for '+name);
   assert.ok(capital && capital.trim(),'Missing capital name for '+name);
  }
 }
});

test('every state and country can be found on a regional map',()=>{
 for(const branch of regions){
  const names=completeLocationRows[branch].map(item=>item.name);
  const questions=locationQuestions.filter(item=>item.branch===branch);
  assert.equal(names.length,expected[branch],branch+' list size');
  assert.equal(questions.length,expected[branch],branch+' question count');
  assert.deepEqual(new Set(questions.map(item=>item.target)),new Set(names),branch+' location coverage');
  for(const question of questions){
   assert.equal(question.locations.length,3,question.id);
   assert.equal(new Set(question.locations).size,3,question.id+' distinct markers');
   assert.ok(question.locations.includes(question.target),question.id+' correct marker');
   const geography=questionGeography(question);
   const pins=geography.panels.flatMap(panel=>panel.numbered);
   assert.deepEqual(new Set(pins.map(pin=>pin.number)),new Set(question.choices),question.id);
   for(const panel of geography.panels){
    for(const pin of panel.numbered){
     assert.ok(pointOnFeature(panel.paths[pin.id],pin.x,pin.y),question.id+' arrow must end on actual geography');
     const [, ,width,height]=geography.view;
     assert.ok(Number.isFinite(pin.x)&&Number.isFinite(pin.y));
     assert.ok(pin.x>=geography.view[0]&&pin.x<=geography.view[0]+width);
     assert.ok(pin.y>=geography.view[1]&&pin.y<=geography.view[1]+height);
    }
   }
  }
 }
});


test('map clues use specific directions instead of generic geography filler',()=>{
 const vague=/look for its location within this part of the world|look for its outline among the other U\.S\. states/i;
 for(const question of locationQuestions){
  assert.equal(question.clues.length,3,question.id+' clue count');
  assert.ok(question.clues.every(clue=>!vague.test(clue)),question.id+' vague clue');
  const relative=question.clues[1].match(/^Look (northwest|northeast|southwest|southeast|north|south|east|west) of marker ([123]) on this map\.$/);
  if(!relative)continue; // Hand-written clues are preserved.
  const second=question.clues[2].match(/^Now look (northwest|northeast|southwest|southeast|north|south|east|west) of marker ([123])\./);
  assert.ok(second,question.id+' needs a second concrete directional clue');
  const answerNumber=question.locations.indexOf(question.target)+1;
  assert.notEqual(Number(relative[2]),answerNumber,question.id+' compares itself');
  assert.notEqual(Number(second[2]),answerNumber,question.id+' compares itself');
  assert.notEqual(relative[2],second[2],question.id+' should compare distinct markers');
  const pins=questionGeography(question).panels[0].numbered;
  const {x:tx,y:ty}=pins.find(pin=>pin.number===question.answer);
  for(const [,direction,number] of [relative,second]){
   const {x,y}=pins.find(pin=>pin.number===number);
   const dx=tx-x,dy=ty-y;
   if(direction.includes('north'))assert.ok(dy<0,question.id+' north is wrong');
   if(direction.includes('south'))assert.ok(dy>0,question.id+' south is wrong');
   if(direction.includes('east'))assert.ok(dx>0,question.id+' east is wrong');
   if(direction.includes('west'))assert.ok(dx<0,question.id+' west is wrong');
  }
 }
});

test('the Caribbean shares a map and dispersed archipelagos have a wider view',()=>{
 const caribbean=['Barbados','Saint Lucia','Dominica','Grenada','Antigua and Barbuda','Saint Kitts and Nevis',
  'Saint Vincent and the Grenadines','Trinidad and Tobago','Bahamas','Jamaica','Cuba','Haiti','Dominican Republic'];
 const byTarget=new Map(locationQuestions.map(question=>[question.target,question]));
 for(const name of caribbean){
  const question=byTarget.get(name);
  const geography=questionGeography(question);
  assert.ok(geography.hasInset,name);
  assert.equal(geography.panels.length,1,name);
  assert.equal(geography.panels[0].numbered.length,3,name);
  assert.ok(geography.panels[0].widthKm>0,name);
 }
 for(const name of ['Kiribati','Tuvalu','Maldives','Vatican City','Malta']){
  const question=byTarget.get(name);
  const geography=questionGeography(question);
  assert.equal(geography.panels.length,3,name);
  assert.ok(geography.panels.every(panel=>panel.widthKm>0&&panel.center.length===2),name);
  if(geography.hasExtent){
   const wider=questionGeography(question,{extent:true});
   assert.ok(wider.panels.some((panel,index)=>panel.widthKm>geography.panels[index].widthKm),name);
   for(const {paths,numbered} of wider.panels){
    assert.equal(numbered.length,1,name);
    const [pin]=numbered;
    assert.ok(pointOnFeature(paths[pin.id],pin.x,pin.y),name);
   }
  }
 }
});
