/* Pure curriculum/session helpers, shared by the page and local tests. */
(function(root){
'use strict';
function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/’/g,"'").replace(/[^a-z0-9\s]/g,' ').replace(/\b(1st|2nd|3rd|4th|5th)\b/g,x=>({'1st':'first','2nd':'second','3rd':'third','4th':'fourth','5th':'fifth'}[x])).replace(/\s+/g,' ').trim();}
function answerText(value,q){let s=normalize(value).replace(/^(it means|the word means|it is|it s) /,'');if(q.mode==='meaning'){s=s.replace(/^(a|an|the) /,'');if(q.details.startsWith('Verb.'))s=s.replace(/^(i |to )/,'');}return s;}
function matches(q,input){
 const raw=String(input||'').trim().toLowerCase();
 if(q.id==='grammar-verb-003:grammar'&&raw==='ēre')return true;
 if(q.id==='grammar-verb-004:grammar'&&raw==='ere')return true;
 const got=answerText(input,q);if(!got)return false;
 if(q.answers.some(a=>answerText(a,q)===got))return true;
 // Attribute lists can be recited in any order; no partial-list credit.
 if(['grammar-noun-011:grammar','grammar-verb-006:grammar'].includes(q.id)){
  const words=s=>normalize(s).split(' ').filter(x=>x!=='and').sort().join(' ');
  return words(input)===words(q.answers[0]);
 }
 return false;
}
function shuffled(items,random=Math.random){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function buildQueue(questions,mode,size,stats,review=false,random=Math.random){
 let pool=questions.filter(q=>mode==='mixed'?q.mode!=='reverse':q.mode===mode);
 if(review)pool=pool.filter(q=>stats[q.id]&&stats[q.id].attempts>0&&stats[q.id].streak===0);
 pool=shuffled(pool,random).sort((a,b)=>(stats[a.id]?.streak||0)-(stats[b.id]?.streak||0));
 const seen=new Set();return pool.filter(q=>{if(seen.has(q.card))return false;seen.add(q.card);return true;}).slice(0,size);
}
function record(stats,q,correct,helped){const prior=stats[q.id]||{};return {...stats,[q.id]:{attempts:(prior.attempts||0)+1,correct:(prior.correct||0)+(correct&&!helped?1:0),streak:correct&&!helped?Math.min(9,(prior.streak||0)+1):0}};}
function lookupStudy(entries,text){
 const query=normalize(text);if(!query)return [];
 let facts=['meaning'];
 if(/\bgender\b/.test(query))facts=['gender'];
 else if(/\b(declension|declination)\b/.test(query))facts=['declension'];
 else if(/\bconjugation\b/.test(query))facts=['conjugation'];
 else if(/\bnominative\b/.test(query))facts=['nominative'];
 else if(/\bgenitive\b/.test(query))facts=['genitive'];
 else if(/principal part/.test(query)){
  const n=query.match(/\b(first|second|third|fourth|1|2|3|4)\b/);
  facts=[n?'principal part '+({first:1,second:2,third:3,fourth:4}[n[1]]||n[1]):'principal parts'];
 }else if(/\bforms\b/.test(query))facts=['forms','principal parts'];
 else if(/part of speech|noun or verb|is .+ a (noun|verb|pronoun|conjunction)/.test(query))facts=['part of speech'];
 else if(!/\b(mean|meaning|translate|english|definition|define)\b|^what is /.test(query)&&!entries.some(e=>e.aliases.some(a=>normalize(a)===query)))return [];
 const padded=' '+query+' ';
 return entries.filter(e=>facts.includes(e.fact)&&e.aliases.some(a=>padded.includes(' '+normalize(a)+' ')));
}
const api={normalize,matches,buildQueue,record,lookupStudy};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LatinQuestCore=api;
})(typeof window!=='undefined'?window:globalThis);
