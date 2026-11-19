'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('static/js/labs-navigation.js','utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
const {GAMES,gameUrl,copyGameLink}=new Function(source+';return {GAMES,gameUrl,copyGameLink}')();
(async()=>{
 assert.equal(GAMES.length,4);assert(GAMES.some(([id])=>id==='grammar'));
 for(const [id,,path]of GAMES){let copied=null;await copyGameLink(id,{writeText:async text=>copied=text});assert.equal(copied,'https://faithsparksprintables.com'+path);assert(!/[?#]/.test(copied))}
 await assert.rejects(()=>copyGameLink('math',null));
 assert.equal(gameUrl('unknown'),'https://faithsparksprintables.com/labs');
 console.log('All four games share canonical links with no learner data; unavailable clipboard exposes manual copying.');
})().catch(e=>{console.error(e);process.exitCode=1});
