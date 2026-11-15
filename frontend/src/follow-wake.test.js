import test from 'node:test';
import assert from 'node:assert/strict';
import {createWakeKeeper} from './follow-wake.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){let visible=true;const pending=[],states=[];const keeper=createWakeKeeper({visible:()=>visible,request:()=>new Promise(resolve=>pending.push(resolve)),publish:state=>states.push(state)});return {keeper,pending,states,hide:()=>{visible=false;keeper.pause();},show:()=>{visible=true;keeper.resume();}};}
function lock(){return{released:0,addEventListener(){},release(){this.released++;return Promise.resolve();}};}
test('turning screen-on off while permission is pending releases the late lock',async()=>{
 const f=fixture();f.keeper.setWanted(true);f.keeper.setWanted(false);const value=lock();f.pending[0](value);await flush();assert.equal(value.released,1);assert.equal(f.states.at(-1).wanted,false);assert.equal(f.states.at(-1).active,false);f.keeper.stop();
});
test('visibility changes keep one pending wake request and reacquire only when wanted',async()=>{
 const f=fixture();f.keeper.setWanted(true);f.hide();f.show();f.show();assert.equal(f.pending.length,1);
 const old=lock();f.pending[0](old);await flush();assert.equal(old.released,1);assert.equal(f.pending.length,2);
 const current=lock();f.pending[1](current);await flush();assert.equal(f.states.at(-1).active,true);f.keeper.stop();assert.equal(current.released,1);
});
