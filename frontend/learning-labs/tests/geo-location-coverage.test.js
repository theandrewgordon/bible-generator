import test from 'node:test';
import assert from 'node:assert/strict';
import {capitalMapData} from '../geo/capital-map-data.js';
import {locationMaps,locationQuestions,completeLocationRows} from '../geo/locations.js';
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
   for(const name of question.locations){
    const point=locationMaps[branch].points[name];
    assert.ok(point,question.id+' missing '+name+' map point');
    assert.ok(Number.isFinite(point[1])&&Number.isFinite(point[2]),question.id+' invalid coordinates for '+name);
   }
  }
 }
});
