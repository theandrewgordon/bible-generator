const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('faithsparks/content/lab_games/same-brain.html','utf8');
const c={localStorage:{getItem:()=>null}};vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('var QUESTIONS='),html.indexOf('var COSMETIC_META=')),c);
const audiences=['everyone','kids','tween','mixed'];
const report={sourceCount:c.QUESTIONS.length,selectable:c.audiencePool(c.QUESTIONS,'everyone').length,retired:c.RETIRED_QUESTION_IDS.length,issues:c.QUESTION_BANK_AUDIT,exactDuplicatePrompts:c.QUESTIONS.length-new Set(c.QUESTIONS.map(q=>q.q.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''))).size,audiences:{},categories:{},retiredIds:c.RETIRED_QUESTION_IDS};
for(const aud of audiences){report.audiences[aud]={source:c.QUESTIONS.filter(q=>aud==='everyone'||q.aud?.includes(aud)).length,selectable:c.audiencePool(c.QUESTIONS,aud).length}}
for(const pack of Object.keys(c.PACKS)){
 const pool=c.QUESTIONS.filter(q=>(c.PACKS[pack]||[]).includes(q.id)||(q.tags||[]).some(t=>(c.PACK_TAGS[pack]||[pack]).includes(t)));
 report.categories[pack]={source:pool.length,...Object.fromEntries(audiences.map(a=>[a,c.audiencePool(pool,a).length]))};
}
fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/same-brain-bank-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,retiredIds:undefined},null,2));
if(report.issues.length||report.exactDuplicatePrompts)process.exitCode=1;
