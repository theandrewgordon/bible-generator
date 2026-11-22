import test from 'node:test';
import assert from 'node:assert/strict';
import {wisdomForQuestion} from '../geo/wisdom.js';
import data from '../geo/data.json' with {type:'json'};
import {placeQuestions} from '../geo/places.js';

test('every geography question has a short, Scripture-rooted encouragement',()=>{
 for(const question of [...data.quest,...placeQuestions]){
  const note=wisdomForQuestion(question);
  assert.ok(note.verse && note.reference && note.connection,question.id);
  assert.ok(note.verse.length<110,question.id+' verse too long for fox field guide');
  assert.ok(note.connection.length<150,question.id+' connection too long');
 }
});
test('field guide follows the geography question rather than a fixed message',()=>{
 assert.equal(wisdomForQuestion({answer:'Nile River'}).reference,'Exodus 2:10');
 assert.equal(wisdomForQuestion({answer:'Pacific Ocean'}).reference,'Psalm 95:5');
 assert.equal(wisdomForQuestion({answer:'Himalayas'}).reference,'Psalm 121:2');
 assert.equal(wisdomForQuestion({target:'Hawaiian Islands',islandGroup:true}).reference,'Psalm 95:5');
 assert.equal(wisdomForQuestion({answer:'compass',topic:'Maps & our planet'}).reference,'Proverbs 2:6');
});
