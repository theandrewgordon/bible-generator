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
   const points=question.locations.map(name=>{
    const point=locationMaps[branch].points[name];
    assert.ok(point,question.id+' missing '+name+' map point');
    assert.ok(Number.isFinite(point[1])&&Number.isFinite(point[2]),question.id+' invalid coordinates for '+name);
    return point;
   });
   for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    assert.ok(Math.hypot(points[i][1]-points[j][1],points[i][2]-points[j][2])>=56,
      question.id+' overlapping marker circles');
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
  const [ ,tx,ty]=locationMaps[question.branch].points[question.target];
  for(const [,direction,number] of [relative,second]){
   const [,x,y]=locationMaps[question.branch].points[question.locations[Number(number)-1]];
   const dx=tx-x,dy=ty-y;
   if(direction.includes('north'))assert.ok(dy<0,question.id+' north is wrong');
   if(direction.includes('south'))assert.ok(dy>0,question.id+' south is wrong');
   if(direction.includes('east'))assert.ok(dx>0,question.id+' east is wrong');
   if(direction.includes('west'))assert.ok(dx<0,question.id+' west is wrong');
  }
 }
});
