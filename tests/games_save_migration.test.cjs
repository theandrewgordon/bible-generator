const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('faithsparks/content/lab_games/games-save-migration.js','utf8');
function storage(seed={}) {
 const data = new Map(Object.entries(seed));
 return {get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
}
test('legacy progress, resume, settings and session deduplication survive renaming',()=>{
 const localStorage=storage({
  tessas_odyssey_platform_v1:JSON.stringify({players:[{name:'Bernard',id:'p1',games:{'whits-end':{xp:43},'wooten-mail-sorting':{highestLevel:6}},activity:[{gameId:'whits-end'}]}]}),
  tessas_odyssey_progress_v1:JSON.stringify({p1:{'whits-end':{session:{party:['Jules','Wooton'],partyOrders:[{customer:'Penny'}]}}}}),
  'tessasOdyssey:bernard-window-washing:resume:p1':JSON.stringify({gameId:'bernard-window-washing',wetness:[{layers:{bernard:.5}}]}),
  timothyCenterHorseRaceProfilesV1:JSON.stringify([{name:'Jules',level:10,horses:[{name:'My Pony',color:4}]}]),
  tessasOdysseySettingsV1:JSON.stringify({sound:false,music:true}),
  unrelated:'untouched'
 });
 const sessionStorage=storage({'tessas_odyssey_session_v1:p1:whits-end':'1'});
 const context={window:{localStorage,sessionStorage}};
 vm.runInNewContext(source,context);
 const platform=JSON.parse(localStorage.getItem('tessas_games_platform_v1'));
 assert.equal(platform.players[0].name,'Bernard');
 assert.equal(platform.players[0].games['gordon-ice-cream-town'].xp,43);
 assert.equal(platform.players[0].games['gordon-mail-run'].highestLevel,6);
 assert.equal(platform.players[0].activity[0].gameId,'gordon-ice-cream-town');
 const session=JSON.parse(localStorage.getItem('tessas_games_progress_v1')).p1['gordon-ice-cream-town'].session;
 assert.deepEqual(session.party,['Nina','Casey']);
 assert.equal(session.partyOrders[0].customer,'Ada');
 const resume=JSON.parse(localStorage.getItem('tessasGames:gordon-window-washing:resume:p1'));
 assert.equal(resume.wetness[0].layers.rowan,.5);
 assert.equal(JSON.parse(localStorage.getItem('gordonFamilyStablesHorseRaceProfilesV1'))[0].horses[0].color,4);
 assert.equal(JSON.parse(localStorage.getItem('tessasGamesSettingsV1')).sound,false);
 assert.equal(sessionStorage.getItem('tessas_games_session_v1:p1:gordon-ice-cream-town'),'1');
 assert.ok(localStorage.getItem('tessas_odyssey_platform_v1'));
 localStorage.setItem('tessas_games_platform_v1','new progress');
 vm.runInNewContext(source,context);
 assert.equal(localStorage.getItem('tessas_games_platform_v1'),'new progress');
 assert.equal(localStorage.getItem('unrelated'),'untouched');
});
test('restricted storage and malformed saves never prevent startup',()=>{
 assert.doesNotThrow(()=>vm.runInNewContext(source,{window:{get localStorage(){throw Error('blocked')},get sessionStorage(){throw Error('blocked')}}}));
 const localStorage=storage({tessas_odyssey_platform_v1:'broken json'});
 assert.doesNotThrow(()=>vm.runInNewContext(source,{window:{localStorage,sessionStorage:storage()}}));
});
