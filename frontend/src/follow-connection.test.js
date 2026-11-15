import test from 'node:test';
import assert from 'node:assert/strict';
import {createFollowConnection} from './follow-connection.js';
function fixture(){
 let shown=true,id=0,reloads=0;const requests=[],states=[],timers=new Map();
 const connection=createFollowConnection({sessionId:'public/id',initial:{revision:2,deckRevision:1,slideCount:5},visible:()=>shown,fetcher:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),publish:state=>states.push(state),reload:()=>reloads++,later:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},cancel:key=>timers.delete(key)});
 return {connection,requests,states,timers,hide:()=>{shown=false;connection.pause();},show:()=>{shown=true;connection.resume();},reloads:()=>reloads,run:delay=>{const found=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(found);timers.delete(found[0]);found[1].fn();}};
}
const response=(revision,extra={})=>new Response(JSON.stringify({ok:true,revision,current_index:revision%5,deck_revision:1,loop_seconds:8,loop_started_epoch:1,loop_indices:[0,1],...extra}));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('tab returns never overlap requests and canceled responses cannot update slides',async()=>{
 const f=fixture(),first=f.connection.refresh();f.hide();f.show();f.show();assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.signal.aborted,true);
 f.requests[0].resolve(response(9));await first;assert.equal(f.states.length,0);f.run(0);assert.equal(f.requests.length,2);
 f.requests[1].resolve(response(4));await flush();assert.ok(f.states.some(s=>s.current===4));f.connection.stop();
});
test('older revisions cannot replace newer announcement-loop state',async()=>{
 const f=fixture(),first=f.connection.refresh();f.requests[0].resolve(response(5,{loop_seconds:10}));await first;
 const next=f.connection.refresh();f.requests[1].resolve(response(3,{loop_seconds:2}));await next;
 assert.deepEqual(f.states.filter(s=>s.loop).map(s=>s.loop.seconds),[10]);f.connection.stop();
});
test('HTTP failures reconnect, and ended sessions cannot restart on visibility events',async()=>{
 const f=fixture(),first=f.connection.refresh();f.requests[0].resolve(new Response('{"ok":true}',{status:503}));await first;
 assert.deepEqual(f.states,[{status:'reconnecting'}]);f.run(1500);f.requests[1].resolve(new Response('',{status:410}));await flush();f.show();
 assert.equal(f.requests.length,2);assert.deepEqual(f.states.at(-1),{ended:true,status:'ended'});assert.equal(f.timers.size,0);
});
test('deck revisions reload once and malformed loop indices cannot select nonexistent slides',async()=>{
 const f=fixture(),first=f.connection.refresh();f.requests[0].resolve(response(4,{loop_indices:[-1,'2','invalid',10,1.5]}));await first;
 assert.deepEqual(f.states.find(s=>s.loop).loop.indices,[2]);const next=f.connection.refresh();f.requests[1].resolve(response(5,{deck_revision:2}));await next;f.show();assert.equal(f.reloads(),1);assert.equal(f.requests.length,2);
});
