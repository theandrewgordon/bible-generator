import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceSaver } from './save-service.js';
function fixture(){
 let resolve, revision='notes-v1',context=1;const status=[],applied=[],pending=[];
 const save=createServiceSaver({fetcher:()=>new Promise(done=>{resolve=done;}),notify:state=>status.push(state)});
 const request={payload:new FormData(),readRevision:()=>revision,readContext:()=>context,setPending:value=>pending.push(value),onSaved:(data,result)=>applied.push(result)};
 return {save,request,status,applied,pending,edit:()=>{revision='notes-v2';},switch:()=>{context++;},finish:()=>resolve(new Response(JSON.stringify({ok:true,id:'service',updated_at:'v2'}),{headers:{'Content-Type':'application/json'}}))};
}
test('unchanged save is clean and overlapping save is rejected',async()=>{
 const f=fixture(),first=f.save(f.request);assert.equal(await f.save(f.request),false);f.finish();assert.equal(await first,true);
 assert.deepEqual(f.applied,[{sameContext:true,unchanged:true}]);assert.deepEqual(f.pending,[true,false]);assert.match(f.status.at(-1).message,/All current changes/);
});
test('edits during save remain unsaved',async()=>{
 const f=fixture(),result=f.save(f.request);f.edit();f.finish();await result;
 assert.deepEqual(f.applied,[{sameContext:true,unchanged:false}]);assert.match(f.status.at(-1).message,/newer edits are still unsaved/);
});
test('loading another service while saving cannot overwrite current service metadata',async()=>{
 const f=fixture(),result=f.save(f.request);f.switch();f.finish();await result;
 assert.equal(f.applied[0].sameContext,false);assert.match(f.status.at(-1).message,/current service was left unchanged/);
});
test('HTTP and server failures preserve edits and permit a fresh retry',async()=>{
 let attempt=0;const status=[],applied=[],busy=[];
 const save=createServiceSaver({fetcher:async()=>++attempt===1?new Response('{"ok":true}',{status:500}):new Response('{"ok":true,"id":"saved"}'),notify:s=>status.push(s)});
 const request={payload:new FormData(),readRevision:()=>1,readContext:()=>1,setPending:p=>busy.push(p),onSaved:d=>applied.push(d)};
 assert.equal(await save(request),false);assert.equal(applied.length,0);assert.equal(status.at(-1).kind,'error');
 assert.equal(await save(request),true);assert.equal(applied.length,1);assert.deepEqual(busy,[true,false,true,false]);
});
