export function numberChoices(answer,random=Math.random){
 if(!Number.isFinite(answer))return [];
 const decimal=Math.abs(answer-Math.round(answer))>1e-7;
 const step=decimal?0.1:1;const choices=new Set([answer]);
 for(const offset of [step,-step,step*2,-step*2,10]){const n=Number((answer+offset).toFixed(6));if(Number.isFinite(n))choices.add(n);if(choices.size===3)break;}
 const list=[...choices];for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}return list;
}
export function outcomeCounts(outcomes){return outcomes.reduce((n,value)=>{if(value==='right')n.independent++;else if(value==='assisted')n.helped++;else n.review++;return n},{independent:0,helped:0,review:0})}

// Independently authored task variants; all expected values derive from the same arithmetic fact.
export function prepareTask(fact,exercise='calculate',random=Math.random){
 const q={...fact};let kind=q.preferredExercise||exercise;if(kind==='mixed')kind=['calculate','missing','story'][Math.floor(random()*3)];
 const symbol={Addition:'+',Subtraction:'−',Multiplication:'×',Division:'÷',Exponents:'^'}[q.operation];const number=n=>n<0?'('+n+')':String(n);const base=q.answer;
 q.taskKind='calculate';
 if(kind==='missing'){
  let side=random()<.5?'a':'b';
  if(q.operation==='Division')side='a';
  if(q.operation==='Multiplication'&&(q.a===0||q.b===0))return q;
  if(q.operation==='Exponents'){if(q.a<=1)return q;side='b';}
  q.taskKind='missing-'+side;q.answer=side==='a'?q.a:q.b;
  q.prompt=(side==='a'?'□':number(q.a))+' '+symbol+' '+(side==='b'?'□':number(q.b))+' = '+number(base)+' · Find the missing number.';
 }else if(kind==='story'){
  q.taskKind='story';const whole=q.a>=0&&q.b>=0&&Number.isInteger(q.a)&&Number.isInteger(q.b);
  if(q.operation==='Addition')q.prompt=whole?`A nature journal has ${q.a} sketches. Add ${q.b} more. How many sketches now?`:`A temperature reading is ${q.a}°C. Its change is ${q.b}°C. What is the new reading?`;
  if(q.operation==='Subtraction')q.prompt=whole&&q.a>=q.b?`An explorer packs ${q.a} trail markers and uses ${q.b}. How many remain?`:`A reading changes from ${q.b}°C to ${q.a}°C. What is final minus initial?`;
  if(q.operation==='Multiplication')q.prompt=whole?`There are ${q.a} boxes with ${q.b} pencils in each. How many pencils altogether?`:`An instrument multiplies an input of ${q.a} by a scale factor of ${q.b}. What output does it show?`;
  if(q.operation==='Division')q.prompt=whole?`${q.a} meters of ribbon are divided into ${q.b} equal pieces. How long is each piece?`:`An instrument shows ${q.a} after multiplying its input by ${q.b}. What was the input?`;
  if(q.operation==='Exponents')q.prompt=`A number pattern multiplies ${q.b} copies of ${number(q.a)} together. What is the product?`;
 }
 return q;
}
