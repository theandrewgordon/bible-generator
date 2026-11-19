import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../static/service-worker.js',import.meta.url),'utf8').replaceAll('__STATIC_VERSION__','release-1');
function fixture({cached=null,noStore=false}={}){
 const handlers={},calls={fetch:0,put:0};
 const cache={match:async()=>cached,put:async()=>{calls.put++;},keys:async()=>[],delete:async()=>true};
 const self={location:{origin:'https://site.test'},addEventListener:(name,handler)=>handlers[name]=handler};
 vm.runInNewContext(source,{self,URL,caches:{open:async()=>cache,match:async()=>cached},fetch:async()=>{calls.fetch++;return new Response('network',{headers:{'Cache-Control':noStore?'private, no-store':'public'}});}});
 const request=async(path,mode='cors')=>{let result;handlers.fetch({request:{method:'GET',url:'https://site.test'+path,mode},waitUntil:()=>{},respondWith:promise=>{result=promise;}});return result?await result:undefined;};
 return {calls,request};
}
test('deploy-versioned and content-hashed assets reuse cache without another request',async()=>{
 for(const path of ['/static/theme.css?v=release-1','/static/dist/shared/ui-abCd1234.js']){
  const f=fixture({cached:new Response('cached')});assert.equal(await (await f.request(path)).text(),'cached');assert.equal(f.calls.fetch,0);
 }
});
test('private Labs assets and API requests stay outside the service-worker cache',async()=>{
 const f=fixture({cached:new Response('private')});
 assert.equal(await f.request('/static/labs/learning/math/main.js'),undefined);assert.equal(await f.request('/api/usage'),undefined);assert.equal(f.calls.fetch,0);
 assert.equal(await (await f.request('/prints','navigate')).text(),'network');assert.equal(f.calls.fetch,1);assert.equal(f.calls.put,0);
});
test('unversioned assets revalidate, and no-store responses are never saved',async()=>{
 const stale=fixture({cached:new Response('cached')});assert.equal(await (await stale.request('/static/icon.png')).text(),'cached');assert.equal(stale.calls.fetch,1);
 const privateAsset=fixture({noStore:true});await privateAsset.request('/static/theme.css');assert.equal(privateAsset.calls.put,0);
});
