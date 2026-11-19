export const initial={mode:'quest',branch:'vocabulary',place:'all',topic:'all',level:'all',index:0,order:null,team:0,scores:[0,0],names:['Explorers','Pathfinders'],answers:{},answerDrafts:{},clue:1,history:[],rounds:0,screen:'home',session:null,clueHistory:{},progress:{},learner:'player-1',learnerNames:{'player-1':'Player 1','player-2':'Player 2','player-3':'Player 3','player-4':'Player 4'},playMode:'solo',playerCount:2,teamLearners:['player-1','player-2']};
export function playingLearners(s){
 if(s.playMode==='players')return s.roundPlayers||Object.keys(initial.learnerNames).slice(0,s.playerCount);
 return s.playMode==='teams'?s.teamLearners:[s.learner];
}
export function activeLearner(s){return playingLearners(s)[s.team]??s.learner}
function emptyScores(s){return Array(s.playMode==='players'?s.playerCount:2).fill(0)}
export function reviewIds(s,learner=s.learner){return Object.entries(s.progress[learner]||{}).filter(([,v])=>v.lastOutcome!=='right').map(([id])=>id)}
function teamAt(s,index){const id=s.session?.ids[index];return s.playMode!=='solo'?(s.answers[id]?.team??s.session?.turns?.[id]??s.session?.nextTeam??((Object.values(s.answers).at(-1)?.team??1)===0?1:0)):0}
export function selectPracticeIds(cases,progress={},count=5,random=Math.random){
 const attempts=id=>{const p=progress[id]||{};return (p.right||0)+(p.assisted||0)+(p.wrong||0)+(p.skipped||0)};
 const buckets=new Map();
 for(const q of shuffled(cases,random)){const key=q.topic||'comparisons';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(q)}
 for(const list of buckets.values())list.sort((a,b)=>attempts(a.id)-attempts(b.id));
 const chosen=[],limit=count||cases.length;
 while(chosen.length<limit){const remaining=[...buckets.values()].filter(b=>b.length);if(!remaining.length)break;const least=Math.min(...remaining.map(b=>attempts(b[0].id)));const groups=shuffled(remaining.filter(b=>attempts(b[0].id)===least),random);for(const group of groups){if(chosen.length>=limit)break;chosen.push(group.shift().id)}}
 return chosen;
}
export function reducer(s,a){
 if(a.type==='undo')return s.history.length?{...s.history.at(-1),history:s.history.slice(0,-1)}:s;
 const snapshot=()=>({...s,history:[...s.history.slice(-19),{...s,history:[]}]});
 if(a.type==='reset-scores')return s.scores.some(Boolean)?{...snapshot(),scores:emptyScores(s)}:s;
 if(a.type==='start')return {...s,screen:'play',session:{ids:a.ids,review:!!a.review,nextTeam:0,turns:{[a.ids[0]]:0}},index:0,clue:1,clueHistory:{},team:0,scores:emptyScores(a.review?{...s,playMode:'solo'}:s),answers:{},answerDrafts:{},history:[],rounds:0,playMode:a.review?'solo':s.playMode,learner:a.learner||s.learner};
 if(a.type==='draft'){if(!s.session?.ids.includes(a.id)||s.answers[a.id]||typeof a.value!=='string')return s;return {...s,answerDrafts:{...s.answerDrafts,[a.id]:a.value.slice(0,80)}}}
 if(a.type==='home')return {...s,screen:'home'};
 if(a.type==='resume')return {...s,screen:'play'};
 if(a.type==='award'||a.type==='skip'){
  if(s.answers[a.id])return s;
  const n=snapshot(),learner=activeLearner(s),outcome=a.type==='skip'?'skipped':a.correct?(s.clue>1?'assisted':'right'):'wrong';
  n.scores=s.scores.map((v,i)=>v+(i===s.team?a.points:0));n.answers={...s.answers,[a.id]:{correct:outcome==='skipped'?null:a.correct,points:a.points,team:s.team,learner,outcome,selected:a.selected||null,...(outcome==='skipped'?{previousRecord:s.progress[learner]?.[a.id]||null}:{})}};n.rounds=s.rounds+1;if(s.session)n.session={...s.session,nextTeam:(s.team+1)%playingLearners(s).length,turns:{...s.session.turns,[a.id]:s.team}};
  const prior=s.progress[learner]?.[a.id]||{right:0,assisted:0,wrong:0};n.progress={...s.progress,[learner]:{...s.progress[learner],[a.id]:{...prior,[outcome]:(prior[outcome]||0)+1,lastOutcome:outcome}}};return n;
 }
 if(a.type==='retry-skipped'){const record=s.answers[a.id];if(record?.outcome!=='skipped')return s;const n=snapshot();n.answers={...s.answers};delete n.answers[a.id];n.rounds=Math.max(0,s.rounds-1);const records={...s.progress[record.learner]};if(record.previousRecord)records[a.id]=record.previousRecord;else delete records[a.id];n.progress={...s.progress,[record.learner]:records};n.team=record.team;return n;}
 if(a.type==='mix-remaining'&&s.session)return {...s,session:{...s.session,ids:[...s.session.ids.slice(0,s.index),...a.ids]},clue:s.clueHistory?.[a.ids[0]]||1};
 if(a.type==='clue'){const clue=Math.min(3,s.clue+1),id=s.session?.ids[s.index];return {...s,clue,clueHistory:id?{...s.clueHistory,[id]:clue}:s.clueHistory};}
 if(a.type==='next'){if(s.session&&s.index+1>=a.length)return {...s,screen:'summary'};const index=(s.index+1)%a.length,team=teamAt(s,index),id=s.session?.ids[index];return {...s,index,team,session:s.session?{...s.session,turns:{...s.session.turns,[id]:team}}:null,clue:s.clueHistory?.[id]||1};}
 if(a.type==='jump')return {...s,index:a.index,team:teamAt(s,a.index),clue:s.clueHistory?.[s.session?.ids[a.index]]||1};
 if(a.type==='branch'){
  if(s.branch===a.branch)return s;
  return reducer({...s,place:'all'},{type:'filter',key:'branch',value:a.branch});
 }
 if(a.type==='player-selection'){
  const playMode=a.teams?'teams':a.ids.length>1?'players':'solo';
  const available=Object.keys(a.names);
  const teamLearners=s.teamLearners.map((id,i)=>available.includes(id)?id:a.ids[i]??available[i]??a.ids[0]);
  const next={...s,playMode,learner:a.ids[0],roundPlayers:a.ids,playerCount:a.ids.length,teamLearners,learnerNames:{...s.learnerNames,...a.names}};
  const same=playMode===s.playMode&&playingLearners(s).join()===playingLearners(next).join();
  return same?next:reducer({...next,session:null},{type:'reset'});
 }
 if(a.type==='filter'&&s[a.key]===a.value)return s;
 if(a.type==='filter'){
  const settings={...s,[a.key]:a.value};
  return {...settings,index:0,team:0,clue:1,order:null,session:null,answers:{},answerDrafts:{},scores:emptyScores(settings),rounds:0,history:[]};
 }
 if(a.type==='shuffle')return {...s,order:a.ids,index:0,clue:1};
 if(a.type==='team'){const id=s.session?.ids[s.index];if(s.answers[id]||!Number.isInteger(a.team)||a.team<0||a.team>=playingLearners(s).length)return s;return {...s,team:a.team,session:s.session?{...s.session,turns:{...s.session.turns,[id]:a.team}}:null};}
 if(a.type==='name')return {...s,names:s.names.map((x,i)=>i===a.team?a.value.slice(0,24):x)};
 if(a.type==='learner-name')return {...s,learnerNames:{...s.learnerNames,[a.id]:a.value.slice(0,24)}};
 if(a.type==='team-learner')return {...s,teamLearners:s.teamLearners.map((id,i)=>i===a.team?a.id:id)};
 if(a.type==='adjust'){const n=snapshot();n.scores=s.scores.map((v,i)=>i===a.team?Math.max(0,v+a.amount):v);return n;}
 if(a.type==='reset')return {...s,screen:'home',session:null,team:0,scores:emptyScores(s),answers:{},answerDrafts:{},history:[],rounds:0,index:0,clue:1};
 return s;
}
export function restore(raw){try{const s=JSON.parse(raw);if(!s||!['quest','compare'].includes(s.mode)||!Array.isArray(s.scores)||s.scores.length!==(s.playMode==='players'?s.playerCount:2)||!s.scores.every(n=>Number.isFinite(n)&&n>=0)||!Array.isArray(s.names)||s.names.length!==2||!s.names.every(n=>typeof n==='string')||(s.playMode==='players'&&![2,3,4].includes(s.playerCount))||!Number.isInteger(s.team)||s.team<0||s.team>=s.scores.length||!Number.isInteger(s.index)||s.index<0)return initial;const validSession=s.session&&Array.isArray(s.session.ids)&&s.session.ids.length&&s.session.ids.every(id=>typeof id==='string'&&/^(?:[gc]\d+|(?:country|state|antarctica|location)-[a-z0-9-]+)$/.test(id));return {...initial,...s,topic:s.topic==='People & structures'?'Human-Made Features':s.topic??initial.topic,screen:['home','play','summary'].includes(s.screen)&&validSession?s.screen:'home',session:validSession?s.session:null,history:Array.isArray(s.history)?s.history.slice(-5).flatMap(h=>{const restored=restore(JSON.stringify({...h,history:[]}));return restored===initial?[]:[restored]}):[],clue:[1,2,3].includes(s.clue)?s.clue:1,answers:s.answers&&typeof s.answers==='object'?s.answers:{},progress:s.progress&&typeof s.progress==='object'?s.progress:{},learnerNames:{...initial.learnerNames,...s.learnerNames}}}catch{return initial}}
export function shuffled(ids,random=Math.random){const out=[...ids];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
