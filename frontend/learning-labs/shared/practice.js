export function numberChoices(answer,random=Math.random){
 if(!Number.isFinite(answer))return [];
 const decimal=Math.abs(answer-Math.round(answer))>1e-7;
 const step=decimal?0.1:1;const choices=new Set([answer]);
 for(const offset of [step,-step,step*2,-step*2,10]){const n=Number((answer+offset).toFixed(6));if(Number.isFinite(n))choices.add(n);if(choices.size===3)break;}
 const list=[...choices];for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}return list;
}
export function outcomeCounts(outcomes){return outcomes.reduce((n,value)=>{if(value==='right')n.independent++;else if(value==='assisted')n.helped++;else n.review++;return n},{independent:0,helped:0,review:0})}
