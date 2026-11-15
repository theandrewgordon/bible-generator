export const initial={mode:'quest',level:'all',index:0,order:null,team:0,scores:[0,0],names:['Explorers','Pathfinders'],answers:{},clue:1,history:[],rounds:0};
export function reducer(s,a){
 if(a.type==='undo')return s.history.length?{...s.history.at(-1),history:s.history.slice(0,-1)}:s;
 const snapshot=()=>({...s,history:[...s.history.slice(-19),{...s,history:[]}]});
 if(a.type==='award'){
  if(s.answers[a.id])return s;
  const n=snapshot();n.scores=s.scores.map((v,i)=>v+(i===s.team?a.points:0));n.answers={...s.answers,[a.id]:{correct:a.correct,points:a.points,team:s.team}};n.rounds=s.rounds+1;return n;
 }
 if(a.type==='clue')return {...s,clue:Math.min(3,s.clue+1)};
 if(a.type==='next')return {...s,index:(s.index+1)%a.length,team:1-s.team,clue:1};
 if(a.type==='jump')return {...s,index:a.index,clue:1};
 if(a.type==='filter')return {...s,[a.key]:a.value,index:0,clue:1,order:null};
 if(a.type==='shuffle')return {...s,order:a.ids,index:0,clue:1};
 if(a.type==='team')return {...s,team:a.team};
 if(a.type==='name')return {...s,names:s.names.map((x,i)=>i===a.team?a.value.slice(0,24):x)};
 if(a.type==='adjust'){const n=snapshot();n.scores=s.scores.map((v,i)=>i===a.team?Math.max(0,v+a.amount):v);return n;}
 if(a.type==='reset')return {...initial,names:s.names};
 return s;
}
export function restore(raw){try{const s=JSON.parse(raw);if(!s||!['quest','compare'].includes(s.mode)||!Array.isArray(s.scores)||s.scores.length!==2||!s.scores.every(n=>Number.isFinite(n)&&n>=0)||!Array.isArray(s.names)||s.names.length!==2||!s.names.every(n=>typeof n==='string')||![0,1].includes(s.team)||!Number.isInteger(s.index)||s.index<0)return initial;return {...initial,...s,history:[],answers:s.answers&&typeof s.answers==='object'?s.answers:{}}}catch{return initial}}
export function shuffled(ids,random=Math.random){const out=[...ids];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
