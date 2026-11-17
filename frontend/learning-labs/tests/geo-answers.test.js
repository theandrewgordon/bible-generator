import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesTerm} from '../geo/answers.js';
test('typed geography accepts spelling case, articles and reviewed equivalent names',()=>{
 for(const [answer,input] of [['bay','A BAY!'],['watershed','drainage basin'],['brook','creek'],['cape','headland'],['forest','woodland'],['altitude','elevation']])assert(matchesTerm(input,{answer}));
 for(const [answer,input] of [['bay','maybe bay or island'],['isthmus','strait'],['glacier','iceberg'],['peak','mountain'],['mesa','plateau']])assert(!matchesTerm(input,{answer}));
 assert(!matchesTerm('',{answer:'bay'}));
});
