const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('faithsparks/content/lab_games/same-brain.html','utf8');
let copies=0,shares=0;
const c={state:{shortCode:'ABC2345',creator:{}},encodeURIComponent,shareBase:()=> 'https://example.test/same-brain',navigator:{share:async()=>{shares++;throw {name:'AbortError'}},clipboard:{writeText:async()=>{copies++}}},alert(){},prompt:()=>null,window:{}};
vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('function originalResultUrl('),html.indexOf('async function shareResult(')),c);
vm.runInContext(html.slice(html.indexOf('async function shareText('),html.indexOf('var customFields=')),c);
(async()=>{
 assert.equal(c.originalResultUrl(),'https://example.test/same-brain?s=ABC2345');
 assert.equal(await c.shareText('result','url'),false);assert.equal(copies,0);
 c.navigator.share=async()=>{throw {name:'NotAllowedError'}};
 assert.equal(await c.shareText('result','url'),true);assert.equal(copies,1);
 c.navigator.share=async()=>{};assert.equal(await c.shareText('result','url'),true);assert.equal(copies,1);
 console.log('PASS: original challenge links retained, share cancellation respected, denied share falls back to copy');
})().catch(e=>{console.error(e);process.exit(1)});
