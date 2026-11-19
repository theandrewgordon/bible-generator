import {labsStorage} from '../../../static/js/labs-storage.js';
import React,{useReducer,useEffect,useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Family} from '../shared/Family.jsx';
import {QuickStart,SessionStatus,LearningSummary,PracticeOptions} from '../shared/widgets.jsx';
import {outcomeCounts} from '../shared/practice.js';
import data from './data.json';
import alegreyaLicense from './fonts/Alegreya-OFL.txt?url';
import {placeBranches,placeQuestions} from './places.js';
import europeMap from './region-maps/europe.webp';
import unitedStatesMap from './region-maps/united-states.webp';
import {ReadAloud} from '../shared/ReadAloud.jsx';
import {stopVoice} from '../shared/voice.js';
import {matchesTerm} from './answers.js';
import {initial,reducer,restore,shuffled,reviewIds,activeLearner,playingLearners,selectPracticeIds} from './logic.js';
import {LocationMap} from './LocationMap.jsx';
import {CapitalMap} from './CapitalMap.jsx';
import {ExpeditionMap,TrailMap} from './ExpeditionMap.jsx';
import './art.css';import './style.css';import './adventure.css';import './board.css';
import {gamePlayerId, mountPlayers, profiles, selectedPlayers} from '../../../static/js/labs-players.js';
import '../../../static/js/labs-players.css';
import './identity.css';
import './art-replacements.css';
const DEFAULT_SESSION_LENGTH=20;
const all=[...data.quest,...data.compare,...placeQuestions],byId=new Map(all.map(q=>[q.id,q])),termTopics=new Map(data.quest.map(q=>[q.answer.toLowerCase(),q.topic]));
const placeArtwork=import.meta.glob('./place-art/*.webp',{eager:true,query:'?url',import:'default'});
const regionalMaps={
 europe:{src:europeMap,alt:'Watercolor map of Europe showing its coastlines, islands, and mountain ranges.'},
 usa:{src:unitedStatesMap,alt:'Watercolor map of the United States with terrain and insets for Alaska and Hawaii.'},
};
function Picture({art,src,label,capitalMap}){
 if(capitalMap)return <CapitalMap map={capitalMap}/>;
 return <div className={art?'landscape '+art:'landscape place-landscape'} style={src?{backgroundImage:`url(${src})`}:undefined} role="img" aria-label={'Illustrated setting for '+label}/>;
}
function playerSettings(state, selected, roster) {
 const ids=selected.map(player=>gamePlayerId(player,'geo'));
 const names=Object.fromEntries(roster.map(player=>[gamePlayerId(player,'geo'),player.name]));
 return {type:'player-selection',ids,names,teams:state.playMode==='teams'};
}
function currentPlayerSettings(state){
 const roster=profiles();
 const preferred=(state.roundPlayers||playingLearners(state)).flatMap(id=>roster.find(player=>gamePlayerId(player,'geo')===id)?.id||[]);
 return playerSettings(state,selectedPlayers('geo',4,preferred),roster);
}
function restoreGame(){
 let saved=initial;
 try{saved=restore(labsStorage.getItem('faithsparks.geo.v2'))}catch{}
 const action=currentPlayerSettings(saved);
 // A paused expedition retains its own players until it is resumed or replaced.
 return saved.session ? {...saved,learnerNames:{...saved.learnerNames,...action.names}} : reducer(saved,action);
}
function ExpeditionPlayers({state,dispatch}){
 const root=useRef(null);
 const current=useRef(state);
 current.current=state;
 useEffect(()=>{
  const roster=profiles();
  const preferred=(current.current.roundPlayers||playingLearners(current.current)).flatMap(id=>roster.find(player=>gamePlayerId(player,'geo')===id)?.id||[]);
  return mountPlayers(root.current,{game:'geo',limit:4,preferred,roleName:'explorer',legend:'Today’s Explorers',onChange:(selected,players)=>{
   dispatch(playerSettings(current.current,selected,players));
  }});
 },[dispatch]);
 return <div ref={root}/>;
}
function App(){
 const [s,dispatch]=useReducer(reducer,initial,restoreGame);
 const lens=useRef(null),lensTrigger=useRef(null),regionPanel=useRef(null);
 const [inputNotice,setInputNotice]=useState('');
 const [reveal,setReveal]=useState(false),[storage,setStorage]=useState(true),[length,setLength]=useState(DEFAULT_SESSION_LENGTH);
 const [worldOpen,setWorldOpen]=useState(false);
 const branch=placeBranches[s.branch];
 const chooseTopic=value=>{
  setWorldOpen(false);
  dispatch({type:'branch',branch:'vocabulary'});
  dispatch({type:'filter',key:'topic',value});
 };
 const place=s.place||'all';
 const placeDeck=branch?placeQuestions.filter(q=>q.branch===s.branch&&(place==='all'||q.place===place)):[];
 const eligible=branch?placeDeck:data[s.mode].filter(q=>(s.level==='all'||q.level===s.level)&&(s.topic==='all'||!s.topic||(s.mode==='compare'?q.terms.some(term=>termTopics.get(term.toLowerCase())===s.topic):q.topic===s.topic)));
 const deck=(s.session?.ids||eligible.map(q=>q.id)).map(id=>byId.get(id)).filter(Boolean);
 const index=deck.length?s.index%deck.length:0,q=deck[index]||data[s.mode][0],isQuest=Array.isArray(q.clues),result=s.answers[q.id];
 const mapQuestion=!!q.locations, typedResponse=!mapQuestion&&s.response==='type';
 const explanation=q.explanation??q.clues?.[2];
 const placeImage=placeArtwork[`./place-art/${q.id}.webp`];
 const typed=s.answerDrafts?.[q.id]||'',setTyped=value=>dispatch({type:'draft',id:q.id,value});
 const person=activeLearner(s),label=id=>s.learnerNames[id]||'Learner';
 const multiplayer=s.playMode!=='solo';
 const roster=playingLearners(s), names=s.playMode==='teams'?s.names:roster.map(label);
 const highScore=Math.max(...s.scores), leaders=names.filter((_,i)=>s.scores[i]===highScore);
 const resetScores=<button className="text-button" disabled={!s.scores.some(Boolean)} onClick={()=>dispatch({type:'reset-scores'})}>Reset scores to 0</button>;
 const nextSelection=currentPlayerSettings(s);
 const playerMode=!nextSelection.teams&&nextSelection.ids.length>1;
 const completeRounds=Math.floor(eligible.length/nextSelection.ids.length);
 const enoughQuestions=eligible.length>0&&(!playerMode||completeRounds>0);
 const freshCount=Math.min(DEFAULT_SESSION_LENGTH,playerMode?completeRounds:eligible.length);
 const freshLabel=freshCount?`Start fresh · ${freshCount} ${playerMode?'per player':freshCount===1?'question':'questions'} →`:'Start fresh →';
 const startFresh=()=>start(false,s.learner,DEFAULT_SESSION_LENGTH);
 const reviewFor=learner=>reviewIds(s,learner).filter(id=>{
  const card=byId.get(id);
  return !!card&&(branch?card.branch===s.branch&&(place==='all'||card.place===place):!card.branch);
 });
 const pending=reviewFor(s.learner);
 const start=(review=false,learner=s.learner,count=Number(length))=>{
  if(!review&&!enoughQuestions)return;
  const nextPlayers=review?[learner]:nextSelection.teams?roster:nextSelection.ids;
  const questionCount=!review&&playerMode?(count?Math.min(count,completeRounds):completeRounds)*nextPlayers.length:count;
  const ids=review?shuffled(reviewFor(learner)).slice(0,DEFAULT_SESSION_LENGTH):selectPracticeIds(eligible,nextPlayers.length>1?nextPlayers.reduce((merged,id)=>{for(const [key,record] of Object.entries(s.progress[id]||{})){const prior=merged[key]||{};merged[key]={right:(prior.right||0)+(record.right||0),assisted:(prior.assisted||0)+(record.assisted||0),wrong:(prior.wrong||0)+(record.wrong||0),skipped:(prior.skipped||0)+(record.skipped||0)}}return merged},{}):s.progress[nextPlayers[0]],questionCount);
  if(ids.length){
   if(!review)dispatch(nextSelection);
   dispatch({type:'start',ids,review,learner:review?learner:nextSelection.ids[0]});
  }setReveal(false)
 };
 const skipped=Object.values(s.answers).filter(a=>a.outcome==='skipped').length;
 const counts=outcomeCounts(Object.values(s.answers).map(a=>a.outcome|| (a.correct?'right':'wrong')));
 const cumulative=Object.values(s.progress[s.learner]||{}).reduce((n,r)=>({independent:n.independent+(r.right||0),helped:n.helped+(r.assisted||0),review:n.review+(r.wrong||0)+(r.skipped||0)}),{independent:0,helped:0,review:0});
 useEffect(()=>{try{labsStorage.setItem('faithsparks.geo.v2',JSON.stringify({...s,history:s.history.slice(-5)}));}catch{setStorage(false)}},[s]);
 useEffect(()=>{stopVoice();setInputNotice('');setReveal(false);if(s.screen==='play'){const heading=document.querySelector('.mystery-board h2');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true});document.querySelector('.mystery-board')?.scrollIntoView({block:'start',behavior:'auto'})}},[q.id,s.screen]);
 useEffect(()=>{if(s.screen==='summary')document.querySelector('.expedition-results h2')?.focus()},[s.screen]);
 useEffect(()=>{if(result)document.querySelector('.discovery')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})},[q.id,result]);
 useEffect(()=>{if(s.screen==='play'&&s.clue>1)document.querySelectorAll('.opened-clue').item(s.clue-1)?.focus({preventScroll:true})},[s.clue]);
 useEffect(()=>{stopVoice()},[s.clue]);
 useEffect(()=>()=>stopVoice(),[]);
 const award=(points,correct,selected=null)=>{dispatch({type:'award',id:q.id,points,correct,selected});setReveal(true)};
 const chooseMarker=number=>{if(!result&&!reveal)award(number===q.answer?4-s.clue:0,number===q.answer,number)};
 const next=()=>{if(!result)dispatch({type:'skip',id:q.id,points:0,correct:false});dispatch({type:'next',length:deck.length});setReveal(false)};
 const learnerSelect=(id,value,onChange)=><label className="geo-field" htmlFor={id}>Learner<select id={id} value={value} onChange={e=>onChange(e.target.value)}>{profiles().map(player=>[gamePlayerId(player,'geo'),player.name]).map(([id,name])=><option key={id} value={id}>{name||'Learner'}</option>)}</select></label>;
 return <><Family game="geo"/><main className={"atlas "+(s.screen==='play'?'on-expedition':'')}><header className="atlas-hero"><div className="atlas-title"><h1><span>Geo</span>{' '}<span>Detectives!</span></h1><p>Explore and discover the world we live in</p></div></header>
 {s.screen==='home'?<section className="geo-home expedition-home">
 <div className="expedition-setup">
  <p className="expedition-directions">Prepare for your journey by declaring today's explorer(s) and then choosing a trail on the Expedition Map below. For all trails except Countries &amp; Continents, decide if you'd like to play Vocabulary Quest or Compare mode. Playing Countries &amp; Continents: Choose your destination and then select your trail from the dropdown menu. Click &quot;Start fresh&quot; to begin exploring the world we live in. (Scroll down past the map to have more say in how you play.)</p>
  <ExpeditionPlayers state={s} dispatch={dispatch}/>
  <label className="geo-field">Scoring<select value={s.playMode==='teams'?'teams':'players'} onChange={e=>{
   const players=profiles();
   const preferred=(s.roundPlayers||[s.learner]).flatMap(id=>players.find(player=>gamePlayerId(player,'geo')===id)?.id||[]);
   dispatch(playerSettings({playMode:e.target.value},selectedPlayers('geo',4,preferred),players));
  }}><option value="players">Individual explorers</option><option value="teams">Two teams</option></select></label>
 </div>
 <ExpeditionMap topic={s.topic||'all'} mode={s.mode} onTopic={chooseTopic} onMode={value=>dispatch({type:'filter',key:'mode',value})} onStart={startFresh} onResume={()=>dispatch({type:'resume'})} resume={!!s.session&&s.rounds<s.session.ids.length} pending={pending.length} available={enoughQuestions?eligible.length:0} needsMoreQuestions={eligible.length>0&&!enoughQuestions} startLabel={freshLabel} onReview={()=>start(true)} worldOpen={worldOpen||!!branch} onWorld={()=>setWorldOpen(true)} regions={Object.entries(placeBranches).map(([id,entry])=><button key={id} aria-pressed={s.branch===id} onClick={()=>{
  dispatch({type:'branch',branch:id});
  requestAnimationFrame(()=>regionPanel.current?.focus());
 }}>{entry.name}</button>)}/>
 {branch?<section className={'case-card geo-place-study'+(regionalMaps[s.branch]?'':' geo-place-study-compact')} ref={regionPanel} tabIndex={-1} aria-label={branch.name+' study'}>
  {regionalMaps[s.branch]&&<img className="geo-region-map" {...regionalMaps[s.branch]} width="1200" height="800"/>}
  <div className="geo-place-controls">
  {branch.trails.length>1&&<label className="geo-field">{branch.focusLabel}<select value={place} onChange={e=>dispatch({type:'filter',key:'place',value:e.target.value})}>
   <option value="all">All trails</option>
   {branch.trails.map(([name])=><option key={name}>{name}</option>)}
  </select></label>}
  <QuickStart heading={place==='all'?branch.name:place} kicker="PLACE GEOGRAPHY"
   description={`${eligible.length} geography mysteries to explore.`}
   startLabel={freshLabel}
   disabled={!enoughQuestions} onStart={startFresh}
   resume={!!s.session&&s.rounds<s.session.ids.length} onResume={()=>dispatch({type:'resume'})}/>
  {!enoughQuestions&&<p role="status">Choose a broader trail so every player gets a turn.</p>}
  {pending.length>0&&<button onClick={()=>start(true)}>Review missed discoveries →</button>}
  </div>
 </section>:null}
 <PracticeOptions label="More Say in How You Play"><div className="geo-option-grid">{!branch&&<><label>Practice<select value={s.mode} onChange={e=>dispatch({type:'filter',key:'mode',value:e.target.value})}><option value="quest">Vocabulary Quest</option><option value="compare">Compare & Contrast</option></select></label><label>Explore a theme<select value={s.topic||'all'} onChange={e=>dispatch({type:'filter',key:'topic',value:e.target.value})}><option value="all">All landscapes</option>{[...new Set(data.quest.map(q=>q.topic))].map(topic=><option key={topic}>{topic}</option>)}</select></label><label>Trail<select value={s.level} onChange={e=>dispatch({type:'filter',key:'level',value:e.target.value})}><option value="all">All trails</option><option value="easy">Starter trail</option><option value="explorer">Explorer trail</option></select></label></>}<label>Answer with<select value={s.response||'choice'} onChange={e=>dispatch({type:'filter',key:'response',value:e.target.value})}><option value="choice">Multiple choice</option><option value="type">Fill in the blank</option></select></label><label>Session length<select value={length} onChange={e=>setLength(Number(e.target.value))}><option value="10">{playerMode?'10 questions per player':'10 questions'}</option><option value={DEFAULT_SESSION_LENGTH}>{DEFAULT_SESSION_LENGTH} questions{playerMode?' per player':''}</option><option value="0">{s.playMode==='players'?'All complete rounds':'Explore the full trail'}</option></select></label></div>

 {s.playMode==='teams'&&s.names.map((name,i)=><div className="team-edit" key={i}><label>Team {i+1}<input value={name} maxLength="24" onChange={e=>dispatch({type:'name',team:i,value:e.target.value})}/></label>{learnerSelect('geo-team-'+i,s.teamLearners[i],id=>dispatch({type:'team-learner',team:i,id}))}</div>)}
 <button disabled={!eligible.length||!enoughQuestions} onClick={()=>start()}>Start with these options →</button><p className="geo-help">Correct on clue 1 earns 3 points, clue 2 earns 2, clue 3 earns 1. A missed or revealed answer earns 0 and returns for review. Skipping saves a mystery for later without marking it wrong. Comparisons are explained aloud and marked together. Vocabulary questions support multiple choice or fill in the blank. Each learner has their own journal.</p></PracticeOptions>
 {Object.keys(s.progress[s.learner]||{}).length>0?<LearningSummary {...cumulative} title={`${label(s.learner)}’s field notes`} reviewDisabled={!pending.length} onReview={()=>start(true)} notes={[`${Object.keys(s.progress[s.learner]||{}).length} different discoveries visited · ${pending.length} ready for review`,`${Object.values(s.progress[s.learner]||{}).reduce((n,r)=>n+(r.skipped||0),0)} skipped · not counted as mistakes`]}/>:<p className="geo-help">Your field notes will appear here after your first discoveries.</p>}
 </section>:s.screen==='summary'?<section className="case-card geo-home"><section className="expedition-results" aria-label="Expedition scores"><p className="eyebrow">EXPEDITION COMPLETE</p><h2 tabIndex="-1">{multiplayer?(leaders.length>1?'A shared adventure · tied scores!':`${leaders[0]} leads the trail!`):`${s.scores[0]} trail points collected`}</h2><div>{names.map((name,i)=><p key={i}><b>{name}</b><strong>{s.scores[i]} <small>points</small></strong></p>)}</div>{resetScores}<p>{skipped?`${skipped} skipped · no wrong answers recorded for these. Revisit them below.`:'Every mystery on this trail has a field note.'}</p></section><LearningSummary {...counts} notes={Object.entries(s.learnerNames).filter(([id])=>Object.values(s.answers).some(a=>a.learner===id)).map(([id,name])=>`${name}: ${Object.values(s.answers).filter(a=>a.learner===id&&a.outcome==='right').length} on their own`)} onStart={startFresh} onUndo={s.history.length?()=>dispatch({type:'undo'}):undefined}/>{[...new Set(Object.values(s.answers).map(a=>a.learner))].map(id=><button key={id} disabled={!reviewFor(id).length} onClick={()=>start(true,id)}>Review {label(id)}’s discoveries →</button>)}<button className="text-button" onClick={()=>dispatch({type:'reset'})}>Choose learner / home</button></section>:<>
 <div className="expedition-status"><SessionStatus learner={s.playMode==='teams'?`${names[s.team]} · ${label(person)}`:label(person)} current={s.rounds} total={deck.length}/><button className="text-button" onClick={()=>dispatch({type:'home'})}>Pause practice</button></div>
 {multiplayer?<section className="teams" aria-label={s.playMode==='teams'?'Team scores':'Player scores'}>{names.map((name,i)=><button key={i} aria-pressed={s.team===i} disabled={!!result||reveal} className={'team-banner '+(s.team===i?'active':'')} onClick={()=>dispatch({type:'team',team:i})}><span>{name}<small>{s.team===i?'YOUR TURN':i===(s.team+1)%names.length?'UP NEXT':''}</small></span><strong>{s.scores[i]}<small>points</small></strong></button>)}</section>:<p className="geo-solo-score"><strong>{s.scores[0]}</strong> points</p>}
 <div className="geo-score-actions">{resetScores}</div>
 <TrailMap deck={deck} index={index} answers={s.answers} rounds={s.rounds} onJump={index=>dispatch({type:'jump',index})}/>
 <nav className="expedition-controls" aria-label="Expedition controls"><button onClick={()=>dispatch({type:'home'})}>🗺 Choose trail</button><button disabled={!!result} onClick={()=>{dispatch({type:'mix-remaining',ids:shuffled(s.session.ids.slice(s.index))});setReveal(false)}}>⤨ Shuffle remaining</button><span>{mapQuestion?'Use the clues to choose a map marker.':isQuest?'Type the geography term or choose the best option.':'Explain a difference aloud, then check it together.'}</span></nav><article className={"case-card mystery-board "+(result?(result.correct?'mystery-solved':'mystery-learned'):'')}><div className="case-meta"><span>{isQuest?'DISCOVERY':'COMPARISON'} {index+1} / {deck.length}{multiplayer?` · ${names[s.team]}`:''}</span><span>{result?(result.outcome==='skipped'?'Skipped · not marked wrong':'Recorded in your atlas'):isQuest?`${4-s.clue} points to discover`:'2 points · explain aloud'}</span></div>
 {isQuest?<><div className="quest-content"><div className="clues"><p className="eyebrow">{q.place||'A LANDSCAPE MYSTERY'}</p><h2>{mapQuestion?`Where is ${q.target}?`:"✦ What could I be? ✦"}</h2><ReadAloud game="geo" text={(mapQuestion?`Where is ${q.target}? Tap 1, 2, or 3. `:'')+q.clues.slice(0,s.clue).map((c,i)=>`Clue ${i+1}. ${c}`).join(' ')+(typedResponse||mapQuestion?'':' Choices: '+q.choices.join(', '))} resetKey={q.id+':'+s.clue}/><div className="clue-dots" aria-label={`Clue ${s.clue} of 3`}>{[1,2,3].map(n=><span key={n} className={n<=s.clue?'uncovered':''}>{n}</span>)}</div><ol className="clue-envelopes">{q.clues.map((clue,i)=>i<s.clue?<li tabIndex="-1" className="opened-clue" key={q.id+'-'+i}><span>{i+1}</span><div><small>CLUE {i+1} · UNCOVERED</small>{clue}</div></li>:<li className="sealed-clue" key={q.id+'-'+i}><button aria-label={`Uncover clue ${i+1}`} disabled={!!result||reveal} onClick={()=>{for(let j=s.clue;j<i+1;j++)dispatch({type:'clue'})}}><span className="envelope-seal" aria-hidden="true">{i+1}</span><span><b>A clue is waiting…</b><small>Tap to unseal · {3-i} {3-i===1?'point':'points'} if solved</small></span><span aria-hidden="true">↗</span></button></li>)}</ol><button className="subtle" disabled={s.clue===3||!!result||reveal} onClick={()=>dispatch({type:'clue'})}>{s.clue===3?'All clues uncovered':'Uncover another clue'} <small>{s.clue<3?`· ${3-s.clue} points next`:''}</small></button></div><figure className="mystery-scene">{mapQuestion?<><LocationMap key={q.id} question={q} result={result} onChoose={chooseMarker}/><figcaption>Tap 1, 2, or 3 to find {q.target}.</figcaption></>:(q.art||placeImage||q.capitalMap)&&<><div className="scene-frame"><Picture art={q.art} src={placeImage} capitalMap={q.capitalMap} label="this geography mystery"/><button className="field-lens" ref={lensTrigger} onClick={()=>lens.current?.showModal()} aria-label="Inspect landscape">⌕ <span>Take a closer look</span></button><span className="scene-corner" aria-hidden="true">✦</span></div><figcaption>{q.capitalMap?.marker?'The star marks the city.':q.capitalMap?'Antarctica':'A related setting · let the clues guide your answer'}</figcaption></>}<aside className="fox-guide"><div className="guide-portrait" aria-hidden="true"/><div className="guide-speech" aria-live="polite"><small>YOUR FOX FIELD GUIDE</small><p>{result?(result.outcome==='skipped'?'This mystery is waiting for another look. No mistake recorded.':result.correct?'A brilliant discovery! Ready for the next mystery?':'Every clue teaches us something. Keep exploring!'):s.clue===1?'Look closely, detective. What does the first clue tell you?':s.clue===2?'A little more of the mystery is unfolding…':'All three clues are open. Which answer fits best?'}</p>{!result&&s.clue<3&&<button onClick={()=>dispatch({type:'clue'})}>Help me uncover a clue →</button>}</div></aside></figure></div>{typedResponse?<form className="geo-typed" onSubmit={e=>{e.preventDefault();if(result||reveal)return;if(!typed.trim()){setInputNotice('Type an answer first.');return}const correct=matchesTerm(typed,q);award(correct?4-s.clue:0,correct,typed.trim())}}><label htmlFor="geo-answer">The geography term is…</label><div><input id="geo-answer" autoComplete="off" maxLength="80" value={typed} disabled={!!result||reveal} onChange={e=>setTyped(e.target.value)}/><button className="primary" disabled={!!result||reveal}>Check answer</button></div><p role="status">{inputNotice}</p></form>:<div className={'answer-choices'+(mapQuestion?' location-choices':'')} aria-label="Answer choices">{q.choices.map((c,i)=><button key={c} disabled={!!result||reveal} className={result&&result.outcome!=='skipped'?(c===q.answer?'correct-answer':result.selected===c?'wrong-answer':''):''} onClick={()=>award(c===q.answer?4-s.clue:0,c===q.answer,c)}>{!mapQuestion&&<span>{String.fromCharCode(65+i)}</span>}{c}</button>)}</div>}</>:<><h2 className="compare-title">What makes these different?</h2><div className="comparison">{q.terms.map((term,i)=><figure key={term}><Picture art={q.arts[i]} label={term}/><figcaption>{term}</figcaption></figure>)}</div><ReadAloud game="geo" text={q.terms.join(' and ')+'. What do they share? What sets them apart? Explain one difference and give an example.'} resetKey={q.id}/><p className="compare-prompt">What do they share? What sets them apart?<br/>Explain one difference and give an example.</p>{!result&&!reveal&&<button className="primary" onClick={()=>setReveal(true)}>We’ve explained it · see the comparison</button>}</>}
 {result?.outcome==='skipped'?<section className="skipped-note" aria-live="polite"><h2>A mystery for later</h2><p>You skipped this question. No answer has been judged, and the answer is still hidden.</p><button className="primary" onClick={()=>{dispatch({type:'retry-skipped',id:q.id});setReveal(false)}}>Try this mystery now →</button></section>:(result||reveal)&&<section className="discovery" aria-live="polite"><div className={result?.correct?'discovery-stamp is-solved':'discovery-stamp'} aria-hidden="true"><span>{result?.correct?'★':'✦'}</span><small>{result?.correct?'SOLVED!':'DISCOVERED'}</small></div><p className="eyebrow">{result?(result.correct?`MYSTERY SOLVED · +${result.points} POINTS`:'A NEW THING LEARNED · 0 POINTS'):'FIELD NOTES'}</p><h2>{mapQuestion?q.target:isQuest?q.answer:q.terms.join(' & ')}</h2>{isQuest&&result&&<p className="answer-verdict">{mapQuestion?(result.correct?`You found ${q.target}!`:result.selected?`Good guess. Look for marker ${q.answer} on the map.`:`Look for marker ${q.answer} on the map.`):result.correct?`Correct! The best answer is ${q.answer}.`:result.selected?`Not quite. You chose ${result.selected}; the best answer is ${q.answer}.`:`Answer revealed: ${q.answer}. This returns to your review trail.`}</p>}<p>{explanation}</p><ReadAloud game="geo" label="Read the explanation" text={((isQuest&&!mapQuestion?q.answer+'. ':'')+explanation)+(q.example?' In the world: '+q.example:'')+(q.note?' Naming note: '+q.note:'')} resetKey={q.id}/>{q.example&&<p className="example">In the world: {q.example}</p>}{q.note&&<p className="geo-fairness-note">Naming note: {q.note}</p>}{!isQuest&&!result&&<div className="judge"><span>Parent / teacher:</span><button onClick={()=>award(2,true)}>Good explanation +2</button><button onClick={()=>award(0,false)}>Keep practicing</button></div>}</section>}
 <div className="case-footer adventure-footer"><button className="text-button" disabled={index===0} onClick={()=>dispatch({type:'jump',index:index-1})}>← Previous</button>{isQuest&&!result&&!reveal&&<button className="text-button" onClick={()=>award(0,false)}>Reveal & learn</button>}<button className="primary" onClick={next}>{index===deck.length-1?'See learning journal':result?'Next discovery':'Skip for now'} →</button></div></article>
 <div className="atlas-bottom"><button disabled={!s.history.length} className="text-button" onClick={()=>{dispatch({type:'undo'});setReveal(false)}}>↶ Undo last action</button><span>{s.rounds-skipped} field notes · {skipped} skipped</span></div>{multiplayer&&<PracticeOptions label="More Say in How You Play"><p>Adjust a score together. Undo can reverse a correction.</p>{names.map((name,i)=><div className="team-edit" key={i}><span>{name}</span><button onClick={()=>dispatch({type:'adjust',team:i,amount:-1})}>−1 point</button><button onClick={()=>dispatch({type:'adjust',team:i,amount:1})}>+1 point</button></div>)}</PracticeOptions>}</>}
 <dialog aria-label="Field lens" className="landscape-lens" ref={lens} onClose={()=>lensTrigger.current?.focus()}><button className="close-lens" onClick={()=>lens.current?.close()} autoFocus>Close field lens ×</button><Picture art={q.art} src={placeImage} capitalMap={q.capitalMap} label="the mystery landscape, enlarged"/><p>{q.capitalMap?.marker?'The star marks the city.':q.capitalMap?'Antarctica':'A related setting. Use the clues to choose the best term.'}</p></dialog>
 <details className="geo-content-note"><summary>About these adventures & sharing</summary><p>Original FaithSparks questions, independently selected and written for general geography practice. Some geographic names overlap. Related terms are not used as wrong-answer traps. Naming conventions are explained in the clues and feedback.</p><p>Location maps use U.S. Census state outlines and Natural Earth country outlines. Small islands and borders are simplified at this scale.</p><p><a href={alegreyaLicense}>Alegreya font license (SIL OFL 1.1)</a></p><p><a href="https://www.usgs.gov/media/audio/what-difference-between-lake-and-pond-mountain-and-hill-or-river-and-creek" target="_blank" rel="noreferrer">USGS: why lake/pond and river/creek boundaries vary</a>. You may share the game link. This is not an official curriculum-provider product.</p></details><footer className="atlas-end">Explore • Wonder • Discover<p>{storage?'Your expedition and learning journal are saved on this browser.':'This browser could not save. Keep this page open to retain your expedition.'}</p></footer></main></>;
}
createRoot(document.getElementById('root')).render(<App/>);
