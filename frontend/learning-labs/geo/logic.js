export const initial={mode:'quest',level:'all',index:0,order:null,team:0,scores:[0,0],names:['Explorers','Pathfinders'],answers:{},clue:1,history:[],rounds:0,screen:'home',session:null,progress:{},learner:'player-1',learnerNames:{'player-1':'Player 1','player-2':'Player 2','player-3':'Player 3'},playMode:'solo',teamLearners:['player-1','player-2']};
export function activeLearner(s){return s.playMode==='teams'?s.teamLearners[s.team]:s.learner}
export function reviewIds(s,learner=s.learner){return Object.entries(s.progress[learner]||{}).filter(([,v])=>v.lastOutcome!=='right').map(([id])=>id)}
export function reducer(s,a){
 if(a.type==='undo')return s.history.length?{...s.history.at(-1),history:s.history.slice(0,-1)}:s;
 const snapshot=()=>({...s,history:[...s.history.slice(-19),{...s,history:[]}]});
 if(a.type==='start')return {...s,screen:'play',session:{ids:a.ids,review:!!a.review},index:0,clue:1,team:0,scores:[0,0],answers:{},history:[],rounds:0,playMode:a.review?'solo':s.playMode,learner:a.learner||s.learner};
 if(a.type==='home')return {...s,screen:'home'};
 if(a.type==='resume')return {...s,screen:'play'};
 if(a.type==='award'){
  if(s.answers[a.id])return s;
  const n=snapshot(),learner=activeLearner(s),outcome=a.correct?(s.clue>1?'assisted':'right'):'wrong';
  n.scores=s.scores.map((v,i)=>v+(i===s.team?a.points:0));n.answers={...s.answers,[a.id]:{correct:a.correct,points:a.points,team:s.team,learner,outcome}};n.rounds=s.rounds+1;
  const prior=s.progress[learner]?.[a.id]||{right:0,assisted:0,wrong:0};n.progress={...s.progress,[learner]:{...s.progress[learner],[a.id]:{...prior,[outcome]:(prior[outcome]||0)+1,lastOutcome:outcome}}};return n;
 }
 if(a.type==='clue')return {...s,clue:Math.min(3,s.clue+1)};
 if(a.type==='next'){if(s.session&&s.index+1>=a.length)return {...s,screen:'summary'};return {...s,index:(s.index+1)%a.length,team:s.playMode==='teams'?1-s.team:0,clue:1};}
 if(a.type==='jump')return {...s,index:a.index,clue:1};
 if(a.type==='filter')return {...s,[a.key]:a.value,index:0,clue:1,order:null,session:null,answers:{},scores:[0,0],rounds:0,history:[]};
 if(a.type==='shuffle')return {...s,order:a.ids,index:0,clue:1};
 if(a.type==='team')return {...s,team:a.team};
 if(a.type==='name')return {...s,names:s.names.map((x,i)=>i===a.team?a.value.slice(0,24):x)};
 if(a.type==='learner-name')return {...s,learnerNames:{...s.learnerNames,[a.id]:a.value.slice(0,24)}};
 if(a.type==='team-learner')return {...s,teamLearners:s.teamLearners.map((id,i)=>i===a.team?a.id:id)};
 if(a.type==='adjust'){const n=snapshot();n.scores=s.scores.map((v,i)=>i===a.team?Math.max(0,v+a.amount):v);return n;}
 if(a.type==='reset')return {...s,screen:'home',session:null,scores:[0,0],answers:{},history:[],rounds:0,index:0,clue:1};
 return s;
}
export function restore(raw){try{const s=JSON.parse(raw);if(!s||!['quest','compare'].includes(s.mode)||!Array.isArray(s.scores)||s.scores.length!==2||!s.scores.every(n=>Number.isFinite(n)&&n>=0)||!Array.isArray(s.names)||s.names.length!==2||!s.names.every(n=>typeof n==='string')||![0,1].includes(s.team)||!Number.isInteger(s.index)||s.index<0)return initial;const validSession=s.session&&Array.isArray(s.session.ids)&&s.session.ids.length&&s.session.ids.every(id=>/^[gc]\d+$/.test(id));return {...initial,...s,screen:['home','play','summary'].includes(s.screen)&&validSession?s.screen:'home',session:validSession?s.session:null,history:[],clue:[1,2,3].includes(s.clue)?s.clue:1,answers:s.answers&&typeof s.answers==='object'?s.answers:{},progress:s.progress&&typeof s.progress==='object'?s.progress:{},learnerNames:{...initial.learnerNames,...s.learnerNames}}}catch{return initial}}
export function shuffled(ids,random=Math.random){const out=[...ids];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
