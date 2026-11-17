
'use strict';
const OPERATIONS=['Addition','Subtraction','Multiplication','Division','Exponents'];
// Suggested ages are flexible starting points, never age-based restrictions.
const LEVELS=[
 {value:'Trailhead',label:'Trailhead · ages 6–7'},
 {value:'Basecamp',label:'Basecamp · ages 7–9'},
 {value:'Pathfinder',label:'Pathfinder · ages 9–11'},
 {value:'Explorer',label:'Explorer · ages 11–12'},
 {value:'Summit',label:'Summit · ages 12–14'},
 {value:'Mixed Levels',label:'Mixed · all 5 stages'}
];
const STAGES=['Trailhead','Basecamp','Pathfinder','Explorer','Summit'];
const LEGACY_LEVEL={Starter:'Trailhead',Builder:'Basecamp',Champion:'Pathfinder'};
function normalizeLevel(level){return LEGACY_LEVEL[level]|| (STAGES.includes(level)||level==='Mixed Levels'?level:'Trailhead')}
const LEVEL_HELP={
 Trailhead:'Facts to 10. Examples: 8 + 2, 9 − 4, 3 × 4, 12 ÷ 3, 3².',
 Basecamp:'Facts through 20 and tens-place jumps. Examples: 9 + 8, 52 − 7, 7 × 8.',
 Pathfinder:'Two-digit mental facts and tables to 12. Examples: 68 + 47, 103 − 58, 12 × 9.',
 Explorer:'Friendly larger numbers and teen products. Examples: 375 + 250, 23 × 7, 276 ÷ 12, 4⁴.',
 Summit:'Strong mental math with signs, decimals, and powers. Examples: −38 + 57, 4.75 − 2.38, 24 × 25, (−3)³.',
 'Mixed Levels':'Mixes all five stages, including the hardest. Choose for confident learners.'
}
const KEY='mathFactRally.v2';
const get=id=>document.getElementById(id);
let players=[],sequence=[],position=0,graded=false,answerRevealed=false,hintUsed=false,progress={},settings={},previousSnapshot=null,session=null,outcomes={},choiceOptions={};
function readSaved(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({progress,settings,session}))}catch(_){}}
function safeText(s){return String(s||'').slice(0,40)}
function shuffle(items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node}
function field(title,control,cls){const lab=el('label','field'+(cls?' '+cls:''),title);lab.appendChild(control);return lab}
function select(values,value){const s=el('select');values.forEach(v=>{const option=el('option','',v.label||v);option.value=v.value||v;s.appendChild(option)});s.value=value;return s}
function readConfig(){return [...get('playerFields').children].map((box,i)=>({name:box.querySelector('.name').value.trim()||`Player ${i+1}`,operations:[...box.querySelectorAll('.op-checkbox:checked')].map(v=>v.value),level:box.querySelector('.level').value,focus:box.querySelector('.focus').value,number:Number(box.querySelector('.focusNumber').value)}))}
function renderPlayers(){const old=readConfig();get('playerFields').replaceChildren();const count=Number(get('playerCount').value);for(let i=0;i<count;i++){
 const info=old[i]||settings.players?.[i]||{};const box=el('div','person');const head=el('div','person-head');head.append(el('h3','',`Player ${i+1}`),el('span','','Individual practice'));box.appendChild(head);
 const name=el('input','name');name.type='text';name.maxLength=30;name.value=info.name||`Player ${i+1}`;box.appendChild(field('Student name',name));
 const ops=el('fieldset','operations'), legend=el('legend','','Operations (choose any)'),grid=el('div','op-grid');ops.appendChild(legend);
 OPERATIONS.forEach(op=>{const lab=el('label','op-choice');const cb=el('input','op-checkbox');cb.type='checkbox';cb.value=op;cb.checked=info.operations?info.operations.includes(op):op==='Addition';lab.append(cb,el('span','',op));grid.appendChild(lab)});ops.appendChild(grid);box.appendChild(ops);
 const difficulty=select(LEVELS,normalizeLevel(info.level));difficulty.className='level';const levelHelp=el('p','small level-help',LEVEL_HELP[difficulty.value]);difficulty.addEventListener('change',()=>levelHelp.textContent=LEVEL_HELP[difficulty.value]);box.appendChild(field('Fluency stage (suggested ages)',difficulty));box.appendChild(levelHelp);
 const focusRow=el('div','focus-row');const f=select([{value:'all',label:'All selected facts'},{value:'number',label:'Facts involving a number'},{value:'review',label:'Prioritize missed facts'}],info.focus||'all');f.className='focus';const num=el('input','focusNumber');num.type='number';num.inputMode='numeric';num.min='0';num.max='20';num.value=Number.isFinite(info.number)?info.number:7;num.disabled=f.value!=='number';f.addEventListener('change',()=>num.disabled=f.value!=='number');focusRow.append(field('Practice focus',f),field('Number',num));box.appendChild(focusRow);get('playerFields').appendChild(box)
}}
function recordKey(q){return `${q.operation}:${q.a}:${q.b}`+(q.taskKind&&q.taskKind!=='calculate'?':'+q.taskKind:'')+(settings.answerStyle==='choice'?':choice':'')}
function getProgress(name){const key=name.trim().toLowerCase();progress[key] ||= {};return progress[key]}
function weightFor(p,q){const record=getProgress(p.name)[recordKey(q)]||{right:0,wrong:0,assisted:0};const base=p.focus==='review'?1+record.wrong*7+record.assisted*3:1+record.wrong*4+record.assisted*2;return Math.max(.7,base-record.right*.55)}
function drawWeighted(list,p){if(!list.length)return null;const total=list.reduce((n,q)=>n+weightFor(p,q),0);let target=Math.random()*total;for(const q of list){target-=weightFor(p,q);if(target<=0)return q}return list.at(-1)}
function calculate(op,a,b){switch(op){case 'Addition':return a+b;case 'Subtraction':return a-b;case 'Multiplication':return a*b;case 'Division':return a/b;default:return a**b}}
function generated(op,level){
 const lvl=level==='Mixed Levels'?STAGES[Math.floor(Math.random()*STAGES.length)]:normalizeLevel(level);
 const r=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
 const one=a=>a[r(0,a.length-1)];
 const chance=p=>Math.random()<p;
 const tenths=n=>Math.round(n*10)/10;
 const hundredths=n=>Math.round(n*100)/100;
 const signed=(low,high)=>r(low,high)*(chance(.5)?-1:1);
 let a=0,b=0;
 switch(op){
 case 'Addition':
  if(lvl==='Trailhead'){a=r(0,10);b=r(0,10-a)}
  else if(lvl==='Basecamp'){
   if(chance(.7)){a=r(3,18);b=r(2,20-a)}else{a=r(2,9);b=r(2,9);a=r(2,9)*10+a}
  }else if(lvl==='Pathfinder'){
   if(chance(.7)){a=r(14,89);b=r(11,99)}else{a=one([25,35,45,75,125]);b=one([15,25,50,75])}
  }else if(lvl==='Explorer'){
   if(chance(.65)){a=r(2,19)*25;b=r(2,14)*25}else{a=r(10,89)*10;b=r(2,98)*10}
  }else{
   const mode=r(0,2);
   if(mode===0){a=signed(10,90);b=signed(10,90)}
   else if(mode===1){a=hundredths(r(20,900)/100);b=hundredths(r(10,800)/100)}
   else{a=r(10,90)*25;b=r(3,35)*25}
  }
  break;
 case 'Subtraction':
  if(lvl==='Trailhead'){a=r(0,10);b=r(0,a)}
  else if(lvl==='Basecamp'){
   if(chance(.7)){a=r(11,30);b=r(2,Math.min(19,a))}
   else{a=r(3,9)*10+r(0,9);b=r(1,9)}
  }else if(lvl==='Pathfinder'){a=r(41,180);b=r(12,Math.min(99,a))}
  else if(lvl==='Explorer'){
   if(chance(.6)){a=r(6,26)*25;b=r(2,Math.min(20,Math.floor(a/25)))*25}
   else{a=r(15,80)*10;b=r(3,Math.min(65,Math.floor(a/10)))*10}
  }else{
   const mode=r(0,2);
   if(mode===0){a=signed(10,100);b=signed(10,90)}
   else if(mode===1){a=hundredths(r(100,1500)/100);b=hundredths(r(30,1200)/100)}
   else{a=r(20,100)*25;b=r(4,60)*25}
  }
  break;
 case 'Multiplication':
  if(lvl==='Trailhead'){a=r(0,5);b=r(0,5)}
  else if(lvl==='Basecamp'){a=r(2,10);b=r(2,10)}
  else if(lvl==='Pathfinder'){a=r(3,12);b=r(3,12)}
  else if(lvl==='Explorer'){
   if(chance(.6)){a=r(13,29);b=r(3,12)}
   else{a=r(11,19);b=r(11,19)}
  }else{
   const mode=r(0,2);
   if(mode===0){a=signed(7,19);b=signed(6,19)}
   else if(mode===1){a=r(14,48);b=one([11,12,15,20,25])}
   else{a=one([12,15,18,24,25,32,36,48,75,125]);b=one([4,8,12,16,20,25])}
  }
  break;
 case 'Division':{
  let divisor=1,quotient=1;
  if(lvl==='Trailhead'){divisor=r(1,5);quotient=r(0,5)}
  else if(lvl==='Basecamp'){divisor=r(2,10);quotient=r(1,10)}
  else if(lvl==='Pathfinder'){divisor=r(3,12);quotient=r(2,12)}
  else if(lvl==='Explorer'){divisor=r(4,19);quotient=r(5,24)}
  else{
   const mode=r(0,2);
   if(mode===0){divisor=one([12,15,16,18,20,24,25]);quotient=r(8,40)}
   else if(mode===1){divisor=one([2,4,5,8,10]);quotient=r(4,35)}
   else{divisor=one([0.25,0.5,1.5,2.5]);quotient=r(4,30)}
   if(chance(.35))divisor=-divisor;
   if(chance(.3))quotient=-quotient;
  }
  b=divisor;a=hundredths(divisor*quotient);break;
 }
 case 'Exponents':
  if(lvl==='Trailhead'){a=r(2,5);b=2}
  else if(lvl==='Basecamp'){a=r(2,10);b=2}
  else if(lvl==='Pathfinder'){if(chance(.7)){a=r(5,15);b=2}else{a=r(2,5);b=3}}
  else if(lvl==='Explorer'){if(chance(.55)){a=r(3,10);b=3}else{a=r(2,5);b=4}}
  else{
   const mode=r(0,2);
   if(mode===0){a=one([-2,-3,-4,-5]);b=r(2,4)}
   else if(mode===1){a=one([2,3,4,5,6]);b=r(3,a<=3?6:4)}
   else{a=r(10,25);b=2}
  }
  break;
 }
 const result=calculate(op,a,b);
 // All answers are derived from exact operations; round only decimal display noise.
 return {id:'Fresh',operation:op,level:lvl,a,b,answer:Number(result.toFixed(8))};
}
function focusedQuestion(operation,level,n){
 const stage=level==='Mixed Levels'?STAGES[Math.floor(Math.random()*STAGES.length)]:normalizeLevel(level);
 const r=(lo,hi)=>lo+Math.floor(Math.random()*(hi-lo+1));
 const one=xs=>xs[r(0,xs.length-1)];
 const upper=({Trailhead:5,Basecamp:10,Pathfinder:12,Explorer:24,Summit:40})[stage];
 let a=n,b=0;
 if(operation==='Addition')b=stage==='Summit'?one([12,25,37,50,75,125,225]):r(1,upper);
 if(operation==='Subtraction'){b=n;a=n+(stage==='Summit'?one([17,25,38,75,125]):r(1,upper));}
 if(operation==='Multiplication')b=stage==='Summit'?one([8,11,12,15,20,25]):r(1,upper);
 if(operation==='Division'){b=n||r(1,Math.max(2,upper));a=n===0?0:b*r(1,upper);}
 if(operation==='Exponents'){a=n;b=stage==='Trailhead'||stage==='Basecamp'?2:stage==='Pathfinder'?r(2,3):stage==='Explorer'?r(2,4):r(2,5);}
 const result=calculate(operation,a,b);
 return {id:'Fresh',operation,level:stage,a,b,answer:Number(result.toFixed(8))};
}
function freshFor(p,used){
 if(p.focus==='review'){
  const review=Object.entries(getProgress(p.name)).filter(([key,rec])=>(settings.answerStyle==='choice'?key.endsWith(':choice'):!key.endsWith(':choice'))&&((rec.wrong||0)+(rec.assisted||0)>0)&&rec.lastOutcome!=='right'&&!used.has(key)).map(([key,rec])=>{const [operation,a,b]=key.split(':');return {id:'Fresh',operation,a:Number(a),b:Number(b),level:rec.level||p.level,preferredExercise:rec.exercise,answer:calculate(operation,Number(a),Number(b))}}).filter(q=>p.operations.includes(q.operation)&&Number.isFinite(q.answer)&&(p.level==='Mixed Levels'||normalizeLevel(q.level)===normalizeLevel(p.level)));
  if(review.length)return drawWeighted(review,p);
 }
 const candidates=[];
 const focused=p.focus==='number'&&Number.isFinite(p.number);
 for(let i=0;i<150;i++){
  const op=p.operations[Math.floor(Math.random()*p.operations.length)];
  const q=focused?focusedQuestion(op,p.level,p.number):generated(op,p.level);
  if((!focused||q.a===p.number||q.b===p.number)&&!used.has(recordKey(q)))candidates.push(q);
 }
 if(candidates.length)return drawWeighted(candidates,p);
 // A very narrow focus can exhaust the available facts. Recycle only after trying new ones,
 // and never use the immediately preceding fact when another distinct fact is possible.
 if(focused){
  const previous=[...used].at(-1),alternatives=[];
  for(let i=0;i<150;i++){
   const op=p.operations[Math.floor(Math.random()*p.operations.length)];
   const q=focusedQuestion(op,p.level,p.number);
   if(recordKey(q)!==previous)alternatives.push(q);
  }
  if(alternatives.length)return drawWeighted(alternatives,p);
  // Some narrow combinations (e.g. practicing only 7²) have just one valid fact.
  // Allow a repeat instead of leaving the player unable to finish the session.
  return focusedQuestion(p.operations[0],p.level,p.number);
 }
 return null;
}
function operationCycle(operations,turns){const result=[];let last=null;while(result.length<turns){const batch=shuffle(operations);if(batch.length>1&&batch[0]===last)[batch[0],batch[1]]=[batch[1],batch[0]];result.push(...batch);last=batch.at(-1)}return result.slice(0,turns)}
function buildSequence(){sequence=[];const turns=Number(get('rounds').value);const used=players.map(()=>new Set()),cycles=players.map(p=>operationCycle(p.operations,turns));for(let round=0;round<turns;round++)for(let i=0;i<players.length;i++){const p=players[i];const fact=freshFor({...p,operations:[cycles[i][round]]},used[i]);if(!fact)throw Error('No question matches this focus. Try another number.');used[i].add(recordKey(fact));const q=window.LabsUI.prepareTask(fact,settings.exercise||'calculate');sequence.push(q);}}
function score(){const board=get('scoreboard');board.replaceChildren();players.forEach((p,i)=>{const box=el('div','score'+(position<sequence.length&&position%players.length===i?' active':''));box.append(el('div','',p.name),el('strong','',String(p.score)),el('div','small',p.operations.join(', ')+' · '+p.level));board.appendChild(box)})}
function notation(q){if(q.prompt)return q.prompt;const symbol={Addition:'+',Subtraction:'−',Multiplication:'×',Division:'÷',Exponents:'^'}[q.operation];const left=q.operation==='Exponents'&&q.a<0?'('+q.a+')':String(q.a);const right=q.b<0?'('+q.b+')':String(q.b);return q.operation==='Exponents'?left+superscript(q.b)+' = ?':left+' '+symbol+' '+right+' = ?'}
function superscript(n){const digits={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};return String(n).split('').map(v=>digits[v]).join('')}
function hint(q){
 if(q.taskKind?.startsWith('missing'))return q.operation==='Exponents'?'Try a whole-number exponent and check it by repeated multiplication.':'Use the related inverse operation, then substitute your number back into the equation to check.';
 if(q.operation==='Addition')return q.a<0||q.b<0?'On a number line, adding a positive moves right and adding a negative moves left.':!Number.isInteger(q.a)||!Number.isInteger(q.b)?'Line up decimal places and combine the whole units and fractional units.':'Break one addend into friendly parts, or make a ten first.';
 if(q.operation==='Subtraction')return q.b<0?'Subtracting a negative is the same as adding its positive opposite.':q.a<0?'Start at the first number on a number line and move left by the positive amount being subtracted.':!Number.isInteger(q.a)||!Number.isInteger(q.b)?'Align the decimal places before subtracting.':'Use a friendly landmark and count the distance between the numbers.';
 if(q.operation==='Multiplication')return q.a<0||q.b<0?'Multiply absolute values; matching signs give a positive product, different signs a negative one.':'Break a factor into easier parts and combine the partial products.';
 if(q.operation==='Division')return !Number.isInteger(q.b)?'Scale both numbers by the same power of ten to make the divisor a whole number; the quotient stays the same.':q.a<0||q.b<0?'Divide absolute values; matching signs give a positive quotient, different signs a negative one.':'Use the related multiplication fact, or divide in chunks.';
 return q.a<0?'Multiply the given number of negative factors. An even number of them gives a positive product.':'An exponent counts factors: multiply that many copies of the base, not the base times the exponent.';
}

function show(){window.LabsUI?.summary('math',null);get('mathChoices').classList.toggle('hidden',settings.answerStyle!=='choice');graded=false;answerRevealed=false;hintUsed=false;const p=players[position%players.length],q=sequence[position];score();window.LabsUI?.status('math',{learner:p.name,current:position,total:sequence.length});get('turn').textContent=`Question ${position+1} of ${sequence.length}`;get('who').textContent=`🎤 ${p.name} · ${q.operation} · ${q.level}`;get('math').style.fontSize='';get('math').classList.toggle('story-question',!!q.prompt);get('math').textContent=notation(q);get('typedPractice').classList.toggle('hidden',settings.answerStyle!=='type');get('typedAnswer').value='';get('typedAnswer').disabled=false;get('checkTyped').disabled=false;get('adventureProgress').max=sequence.length;get('adventureProgress').value=position;get('questionCode').textContent=q.taskKind==='story'?'Story challenge':q.taskKind?.startsWith('missing')?'Missing-number challenge':'Number-sentence challenge';get('answer').textContent=settings.answerStyle==='aloud'?'Say your answer aloud!':settings.answerStyle==='choice'?'Choose the answer below.':'Type your answer below.';get('message').textContent='Take your time. Every question is a chance to learn.';get('hint').classList.add('hidden');for(const id of ['hintBtn','reveal','correct','assisted','incorrect']){get(id).disabled=false;get(id).classList.remove('hidden')}for(const id of ['correct','assisted','incorrect'])get(id).classList.toggle('hidden',settings.answerStyle!=='aloud');get('next').classList.add('hidden');get('undo').disabled=!previousSnapshot;renderChoiceAnswers()}
function mark(outcome){if(graded)return;if(outcome==='right'&&(answerRevealed||hintUsed))outcome='assisted';if(answerRevealed&&outcome==='assisted')outcome='wrong';previousSnapshot={progress:JSON.parse(JSON.stringify(progress)),scores:players.map(p=>p.score),position,outcomes:{...outcomes},hintUsed,answerRevealed};outcomes[position]=outcome;graded=true;const p=players[position%players.length],q=sequence[position],key=recordKey(q),rec=getProgress(p.name)[key]||{right:0,wrong:0,assisted:0};if(outcome==='right'){p.score++;rec.right++}else if(outcome==='assisted'){p.score++;rec.assisted=(rec.assisted||0)+1}else{rec.wrong++}rec.exercise=q.taskKind==='story'?'story':q.taskKind?.startsWith('missing')?'missing':'calculate';rec.level=q.level;rec.lastOutcome=outcome;getProgress(p.name)[key]=rec;get('typedAnswer').disabled=true;get('checkTyped').disabled=true;get('adventureProgress').value=position+1;get('answer').textContent=`Answer: ${q.answer}`;get('message').textContent=outcome==='right'?'Independent! +1 point.':outcome==='assisted'?'With help — saved for review. +1 point.':'Saved for another practice round.';['hintBtn','reveal','correct','assisted','incorrect'].forEach(id=>get(id).classList.add('hidden'));get('next').classList.remove('hidden');get('next').textContent=position===sequence.length-1?'🏁 Finish game':'Next question →';saveSession();score();get('undo').disabled=false;window.LabsUI?.status('math',{learner:p.name,current:position+1,total:sequence.length});renderChoiceAnswers()}

function nextDiscovery(p){
 const data=Object.fromEntries(Object.entries(getProgress(p.name)).filter(([key])=>settings.answerStyle==='choice'?key.endsWith(':choice'):!key.endsWith(':choice')));
 const review=Object.entries(data).filter(([key,rec])=>p.operations.includes(key.split(':')[0])&&rec&&Number(rec.wrong||0)+Number(rec.assisted||0)>0);
 review.sort((a,b)=>(Number(b[1].wrong||0)*3+Number(b[1].assisted||0)*2-Number(b[1].right||0)*.3)-(Number(a[1].wrong||0)*3+Number(a[1].assisted||0)*2-Number(a[1].right||0)*.3));
 if(review.length){
  const [operation,a,b]=review[0][0].split(':');
  return 'Tomorrow, revisit '+notation({operation,a:Number(a),b:Number(b)}).replace(' = ?','')+'.';
 }
 return 'Tomorrow, explore more '+String(p.operations[0]||'math').toLowerCase()+' facts!';
}
function finish(){
 score();get('turn').textContent='Practice complete';get('who').textContent='Today’s discoveries';get('math').textContent='';get('answer').textContent='Every answer is a step forward.';get('message').textContent='Your discoveries were saved on this device.';get('hint').classList.add('hidden');get('typedPractice').classList.add('hidden');get('mathChoices').classList.add('hidden');get('next').classList.add('hidden');session=null;persist();get('results').classList.remove('hidden');
 window.LabsUI?.status('math',{learner:players.map(p=>p.name).join(' & '),current:sequence.length,total:sequence.length});
 window.LabsUI?.summary('math',{...window.LabsUI.counts(Object.values(outcomes)),autoFocus:true,title:'Today’s journal page',notes:players.map(p=>p.name+': '+nextDiscovery(p)),onReview:()=>{get('rounds').value='5';get('source').value='fresh';begin(players.map(p=>({...p,focus:'review'})),true)},onStart:()=>{get('rounds').value='5';begin(players,true)},onHome:restart,onUndo:previousSnapshot?undoLastAnswer:undefined});
 get('results').scrollIntoView?.({block:'nearest',behavior:'smooth'});
}
function renderChoiceAnswers(){const root=get('mathChoices');root.replaceChildren();if(settings.answerStyle!=='choice'||!sequence[position])return;for(const value of (choiceOptions[position] ||= window.LabsUI.choices(sequence[position].answer))){const button=el('button','',String(value)+(graded&&value===sequence[position].answer?' ✓':''));button.type='button';button.disabled=graded||answerRevealed;button.addEventListener('click',()=>mark(Math.abs(value-sequence[position].answer)<1e-7?'right':'wrong'));root.appendChild(button)}}
function undoLastAnswer(){if(!previousSnapshot)return;const old=previousSnapshot;progress=old.progress;players.forEach((p,i)=>p.score=old.scores[i]);position=old.position;outcomes=old.outcomes||{};previousSnapshot=null;get('results').classList.add('hidden');show();hintUsed=!!old.hintUsed;answerRevealed=!!old.answerRevealed;if(hintUsed){get('hint').textContent=hint(sequence[position]);get('hint').classList.remove('hidden');get('hintBtn').disabled=true}if(answerRevealed){get('answer').textContent='Answer: '+sequence[position].answer;get('correct').disabled=true;get('assisted').disabled=true}renderChoiceAnswers();saveSession();get('message').textContent='Last answer undone. Choose again.';}

function begin(configOverride,preserveRoster=false){const v=get('validation');v.classList.add('hidden');const config=(configOverride||readConfig()).map(p=>({...p,level:normalizeLevel(p.level)}));get('source').value='fresh';const missing=config.findIndex(p=>!p.operations.length);if(missing!==-1){v.textContent=`Choose at least one operation for Player ${missing+1}.`;v.classList.remove('hidden');return}players=config.map(p=>({...p,score:0}));settings={exercise:get('exerciseStyle').value,answerStyle:get('answerStyle').value,activeLearner:get('math-learner').value,playerCount:preserveRoster?(settings.players?.length||config.length):config.length,rounds:get('rounds').value,source:get('source').value,players:preserveRoster?(settings.players||config):config};persist();try{buildSequence()}catch(e){v.textContent=e.message;v.classList.remove('hidden');return}position=0;previousSnapshot=null;outcomes={};choiceOptions={};session=null;get('home').classList.add('hidden');get('report').classList.add('hidden');get('results').classList.add('hidden');get('setup').classList.add('hidden');get('game').classList.remove('hidden');show();saveSession();window.scrollTo?.({top:0,behavior:'instant'})}
function restart(){session=null;persist();get('setup').classList.add('hidden');get('game').classList.add('hidden');get('report').classList.add('hidden');get('home').classList.remove('hidden');players=[];sequence=[];position=0;graded=false;renderHome();window.scrollTo?.({top:0,behavior:'instant'})}
window.addEventListener('error',event=>{const box=get('error');box.textContent=`The game encountered an error: ${event.message}`;box.classList.remove('hidden')});
get('typedPractice').addEventListener('submit',e=>{e.preventDefault();if(graded)return;const text=get('typedAnswer').value.trim().replace(/−/g,'-').replace(/(?<=\d),(?=\d{3}(?:\D|$))/g,'');if(!text||!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(text)){get('message').textContent='Enter a number, such as 12, −3 (use the minus key), or 2.5.';return}mark(Math.abs(Number(text)-sequence[position].answer)<1e-7?'right':'wrong')});
const saved=readSaved();progress=saved.progress||{};settings=saved.settings||{};session=saved.session||null;get('answerStyle').value=settings.answerStyle||'aloud';get('playerCount').value=String(settings.playerCount||1);get('rounds').value=settings.rounds||'10';get('source').value='fresh';renderPlayers();
get('playerCount').addEventListener('change',renderPlayers);get('start').addEventListener('click',()=>begin());get('restart').addEventListener('click',restart);get('reveal').addEventListener('click',()=>{answerRevealed=true;get('answer').textContent=`Answer: ${sequence[position].answer}`;get('reveal').disabled=true;get('correct').disabled=true;get('assisted').disabled=true;get('message').textContent='Answer shown — this fact is worth reviewing.';if(settings.answerStyle!=='aloud')mark('wrong');saveSession()});get('hintBtn').addEventListener('click',()=>{hintUsed=true;get('hint').textContent=hint(sequence[position]);get('hint').classList.remove('hidden');get('hintBtn').disabled=true;saveSession()});get('correct').addEventListener('click',()=>mark('right'));get('assisted').addEventListener('click',()=>mark('assisted'));get('incorrect').addEventListener('click',()=>mark('wrong'));get('next').addEventListener('click',()=>{if(!graded)return;position++;if(position<sequence.length){show();saveSession()}else finish()});get('exportProgress').addEventListener('click',()=>{const data={app:'Math Fact Adventure',version:5,exported:new Date().toISOString(),progress,settings};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='math-fact-adventure-progress.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)});
get('importProgress').addEventListener('click',()=>get('importFile').click());
get('importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;const v=get('validation');try{if(file.size>2_000_000)throw Error('File too large');const data=JSON.parse(await file.text());if(!['Math Fact Adventure','Math Fact Rally'].includes(data.app)||!data.progress||typeof data.progress!=='object'||Array.isArray(data.progress))throw Error('Not a valid Math Fact Adventure backup');if(!data.settings||typeof data.settings!=='object')throw Error('Backup is missing settings');progress=data.progress;settings=data.settings;persist();get('playerCount').value=String(Math.min(4,Math.max(1,Number(settings.playerCount)||1)));get('rounds').value=['5','10','15','20'].includes(String(settings.rounds))?String(settings.rounds):'10';get('source').value='fresh';renderPlayers();v.textContent='Practice history and player settings imported.';v.classList.remove('hidden')}catch(err){v.textContent='Import failed: '+err.message;v.classList.remove('hidden')}e.target.value=''});
get('clearProgress').addEventListener('click',()=>{if(!window.confirm('Clear saved practice history on this device? Export a backup first if you want to keep it.'))return;progress={};persist();get('validation').classList.remove('hidden');get('validation').textContent='Saved practice history cleared.'});

function saveSession(){session={players,sequence,position,graded,answerRevealed,hintUsed,previousSnapshot,outcomes,choiceOptions,answerStyle:settings.answerStyle};persist()}
function renderHome(){get('exerciseStyle').value=settings.exercise||'calculate';get('homeOptions').open=false;const select=get('math-learner');select.replaceChildren();const everyone=el('option','','Everyone together');everyone.value='all';select.appendChild(everyone);for(const p of settings.players||[{name:'Player 1'}]){const option=el('option','',p.name);option.value=p.name;select.appendChild(option)}select.value=settings.activeLearner||'all';if(!select.value)select.value='all';get('answerStyle').value=settings.answerStyle||'aloud';window.LabsUI?.quick('math',{id:'quickFive',onStart:startQuickFive,resume:!!session?.sequence?.length,description:'Five questions per learner. Your settings and learning journal are saved.'});const box=get('homePlayers');box.replaceChildren();const p=settings.players?.length?settings.players:[{name:'Player 1',operations:['Addition'],level:'Trailhead'}];for(const x of p){const row=el('div');row.append(el('strong','',x.name),el('small','',`${(x.operations||['Addition']).join(' + ')} · ${normalizeLevel(x.level)}`));box.appendChild(row)}get('resumeInfo').textContent=session?.sequence?.length?'Your last game is saved. Resume to continue.':'Individual settings are saved on this device.';get('homePlay').textContent=session?.sequence?.length?'Resume saved game':'Play saved question length';}


function factPatterns(op,a,b){
 const labels=[];
 if(op==='Addition'){
  if(a===b)labels.push('Doubles');
  if(Math.abs(a-b)===1)labels.push('Near doubles');
  if(a+b>10&&a<10&&b<10)labels.push('Making ten');
  if(a===0||b===0)labels.push('Adding zero');
  if(a+b>=20)labels.push('Larger addition facts');
 }
 if(op==='Subtraction'){
  if(a>=10&&a-b<10&&b>0)labels.push('Subtracting across ten');
  if(b===0)labels.push('Subtracting zero');
  if(a===b)labels.push('Subtracting equal numbers');
  if(a>=20)labels.push('Larger subtraction facts');
 }
 if(op==='Multiplication'){
  if(a===0||b===0)labels.push('Multiplying by zero');
  if(a===1||b===1)labels.push('Multiplying by one');
  if(a===b)labels.push('Square facts');
  if([6,7,8,9].includes(a)||[6,7,8,9].includes(b))labels.push('6–9 times tables');
 }
 if(op==='Division'){
  if(b===2)labels.push('Dividing by two');
  if(b===5||b===10)labels.push('Dividing by five or ten');
  if(b>=6)labels.push('Larger division facts');
 }
 if(op==='Exponents'){
  if(b===2)labels.push('Square powers');
  if(b===3)labels.push('Cube powers');
  if(b>=4)labels.push('Higher powers');
 }
 return labels;
}
function learningPatterns(data){
 const counts=new Map();
 for(const [key,rec] of Object.entries(data||{})){
  const [op,rawA,rawB]=key.split(':');
  const a=Number(rawA),b=Number(rawB);
  if(!OPERATIONS.includes(op)||!Number.isFinite(a)||!Number.isFinite(b)||!rec||typeof rec!=='object')continue;
  const right=Math.max(0,Number(rec.right)||0),assisted=Math.max(0,Number(rec.assisted)||0),wrong=Math.max(0,Number(rec.wrong)||0);
  for(const label of factPatterns(op,a,b)){
   const tag=op+'|'+label;
   const row=counts.get(tag)||{operation:op,label,total:0,difficult:0,missed:0,assisted:0,facts:new Set()};
   row.total+=right+assisted+wrong;row.difficult+=assisted+wrong;row.missed+=wrong;row.assisted+=assisted;row.facts.add(key);counts.set(tag,row);
  }
 }
 return [...counts.values()].filter(r=>r.total>=3&&r.difficult>=2&&r.difficult/r.total>=.35)
  .sort((a,b)=>b.difficult/b.total-a.difficult/a.total||b.difficult-a.difficult).slice(0,3);
}
function addLearningSummary(parent,data){
 const patterns=learningPatterns(data);
 const section=el('div','learning-summary');
 section.append(el('h4','','Patterns worth practicing'));
 if(patterns.length){
  for(const item of patterns){
   const row=el('p','',item.label+' ('+item.operation+'): '+item.difficult+' of '+item.total+' attempts needed help or review.');
   section.append(row);
  }
  section.append(el('p','small','These are practice clues, not a diagnosis. Only skills with enough recorded attempts are shown.'));
 }else{
  section.append(el('p','small','Keep practicing! More answers are needed before the game can identify a reliable pattern.'));
 }
 parent.append(section);
}
function showReport(){get('home').classList.add('hidden');get('setup').classList.add('hidden');get('report').classList.remove('hidden');const root=get('reportContent');root.replaceChildren();const ps=settings.players?.length?settings.players:[{name:'Player 1'}];ps.forEach(p=>{const data=Object.fromEntries(Object.entries(getProgress(p.name)).filter(([key])=>settings.answerStyle==='choice'?key.endsWith(':choice'):!key.endsWith(':choice'))),records=Object.entries(data).filter(([,v])=>v&&typeof v==='object');const strong=records.filter(([,v])=>(v.right||0)>=3&&(v.wrong||0)===0&&(v.assisted||0)===0);const review=records.filter(([,v])=>v.lastOutcome?v.lastOutcome!=='right':(v.wrong||0)+(v.assisted||0)>0).sort((a,b)=>((b[1].wrong||0)*2+(b[1].assisted||0))-((a[1].wrong||0)*2+(a[1].assisted||0))).slice(0,8);const card=el('div','report-item');card.append(el('div','small',settings.answerStyle==='choice'?'Choice practice · separate from recall':'Recall practice · verbal and typed'),el('h3','',p.name),el('p','',`${records.length} different facts practiced · ${strong.length} answered independently 3+ times · ${review.length} highlighted for review`));addLearningSummary(card,data);if(review.length){card.append(el('div','small','Review these facts:'));for(const [key] of review){const [op,a,b]=key.split(':');card.append(el('span','pill',notation({operation:op,a:Number(a),b:Number(b)}).replace(' = ?','')))}const b=el('button','green','Practice weak facts');b.addEventListener('click',()=>{get('report').classList.add('hidden');get('source').value='fresh';const cfg=(settings.players||ps).map(x=>({...x,focus:x.name===p.name?'review':x.focus||'all'}));get('playerCount').value=String(cfg.length);begin(cfg)});card.append(b)}else card.append(el('p','small','No missed or assisted facts yet. Keep playing!'));root.append(card)})}
function restoreSession(){if(!session||!Array.isArray(session.players)||!Array.isArray(session.sequence)||!session.sequence.length)return false;settings.answerStyle=session.answerStyle||settings.answerStyle;players=session.players;sequence=session.sequence;position=session.position||0;graded=!!session.graded;answerRevealed=!!session.answerRevealed;hintUsed=!!session.hintUsed;previousSnapshot=session.previousSnapshot||null;outcomes=session.outcomes||{};choiceOptions=session.choiceOptions||{};get('home').classList.add('hidden');get('setup').classList.add('hidden');get('game').classList.remove('hidden');get('results').classList.add('hidden');const savedFlags={graded,answerRevealed,hintUsed};show();({graded,answerRevealed,hintUsed}=savedFlags);if(graded){const q=sequence[position];get('answer').textContent=`Answer: ${q.answer}`;['hintBtn','reveal','correct','assisted','incorrect'].forEach(id=>get(id).classList.add('hidden'));get('next').classList.remove('hidden')}else if(answerRevealed){get('answer').textContent=`Answer: ${sequence[position].answer}`;get('correct').disabled=true;get('assisted').disabled=true}else if(hintUsed){get('hint').textContent=hint(sequence[position]);get('hint').classList.remove('hidden');get('hintBtn').disabled=true}renderChoiceAnswers();get('undo').disabled=!previousSnapshot;return true}

function startQuickFive(){
 if(session?.sequence?.length){restoreSession();return}
 get('rounds').value='5';const roster=settings.players?.length?settings.players:readConfig();const selected=get('math-learner').value;begin(selected==='all'?roster:roster.filter(p=>p.name===selected),true);
}
get('homePlay').addEventListener('click',()=>{
 if(session?.sequence?.length){restoreSession();return}
 get('rounds').value=String(settings.rounds||'10');
 begin(settings.players?.length?settings.players:readConfig());
});
get('exerciseStyle').addEventListener('change',()=>{settings.exercise=get('exerciseStyle').value;persist()});
get('answerStyle').addEventListener('change',()=>{settings.answerStyle=get('answerStyle').value;persist()});
get('homeEdit').addEventListener('click',()=>{get('home').classList.add('hidden');get('setup').classList.remove('hidden')});
get('homeReport').addEventListener('click',showReport);
get('reportBack').addEventListener('click',()=>{get('report').classList.add('hidden');get('home').classList.remove('hidden');renderHome()});
get('undo').addEventListener('click',undoLastAnswer);
renderHome();
