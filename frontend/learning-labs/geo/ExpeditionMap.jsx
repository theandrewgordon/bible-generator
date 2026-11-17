import React from 'react';
import {QuickStart} from '../shared/widgets.jsx';
const places=[
 {topic:'Water & coasts',icon:'≈',art:'art-beach',x:18,y:65,description:'Follow the water from quiet shores to the open sea.'},
 {topic:'Land & ice',icon:'△',art:'art-mountain',x:46,y:19,description:'Head for the heights, icy valleys and wide-open land.'},
 {topic:'Living landscapes',icon:'♧',art:'art-forest',x:74,y:39,description:'Step into green places and discover what grows there.'},
 {topic:'People & structures',icon:'⌂',art:'art-canal',x:79,y:76,description:'Explore the places and structures people build.'},
 {topic:'Maps & our planet',icon:'✥',art:'art-altitude expedition-atlas',x:45,y:78,description:'Find your bearings and see our world in a new way.'},
 {topic:'Changing Earth',icon:'✦',art:'art-volcano',x:18,y:22,description:'Look for the forces that shape a changing planet.'}
];
export function ExpeditionMap({topic,mode,onTopic,onMode,onStart,onResume,resume,pending,onReview,available}){
 const place=places.find(p=>p.topic===topic);
 return <section className="expedition-board" aria-label="Choose an expedition">
  <div className="world-map">
   <div className="map-heading"><span>YOUR NEXT ADVENTURE</span><h2>Where shall we explore?</h2><p>Tap a place on the map to choose your trail.</p></div>
   <svg className="map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M18 22 C27 7 40 7 46 19 S78 15 74 39 S91 63 79 76 S51 95 45 78 S9 94 18 65 S34 43 18 22"/></svg>
   <div className="map-compass" aria-hidden="true">N<span>✥</span>S</div>
   {places.map(p=><button key={p.topic} className={'map-stop '+(topic===p.topic?'selected':'')} style={{'--x':p.x+'%','--y':p.y+'%'}} aria-pressed={topic===p.topic} onClick={()=>onTopic(p.topic)}><span className="map-stop-icon" aria-hidden="true">{p.icon}</span><span className="map-stop-label">{p.topic}</span>{topic===p.topic&&<span className="map-selected" aria-hidden="true">⚑</span>}</button>)}
   <button className="all-trails" aria-pressed={topic==='all'} onClick={()=>onTopic('all')}>✧ Explore everywhere</button>
  </div>
  <aside className="mission-card">
   <div className="mission-tabs" aria-label="Choose your adventure"><button aria-pressed={mode==='quest'} onClick={()=>onMode('quest')}>🧭 Quest</button><button aria-pressed={mode==='compare'} onClick={()=>onMode('compare')}>⛰ Compare</button></div>
   <div className="mission-picture"><div className={'landscape '+(place?.art||'art-mountain')} role="img" aria-label={place?.topic||'Watercolor mountain landscape'}/><span className="mission-pin" aria-hidden="true">✦</span></div>
   <p className="mission-location">{place?.topic||'The whole wide world'}</p>
   <QuickStart disabled={!available} heading={mode==='compare'?'Spot the difference!':'Your mystery awaits…'} kicker="PACK YOUR CURIOSITY" onStart={onStart} onResume={onResume} resume={resume} description={mode==='compare'?'Two landscapes. What makes them alike—and different?':place?.description||'Five mysteries. Three sealed clues. Let curiosity lead the way.'}/>
   {!available&&<p className="mission-empty" role="status">No mysteries match these options. Choose “All trails” in Practice options, or try another place.</p>}
   <button className="review-postcard" disabled={!pending} onClick={onReview}>✦ Explore again <span>{pending?`${pending} discoveries to revisit`:'Your review trail will grow as you play'}</span></button>
  </aside>
 </section>;
}
export function TrailMap({deck,index,answers,rounds,onJump}){
 const size=Math.min(deck.length,5),start=Math.floor(index/size)*size,visible=deck.slice(start,start+size);
 return <nav className="discovery-map" aria-label="Discovery map"><div className="trail-caption"><span>YOUR DISCOVERY TRAIL</span><b>{Object.keys(answers).length} / {deck.length} discoveries</b></div><div className="trail-steps"><svg viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true"><path d="M30 35 Q140 0 250 35 T470 35 T690 35 T910 35 L970 35"/></svg>{visible.map((entry,j)=>{const i=start+j,a=answers[entry.id];return <button key={entry.id} className={(a?'visited ':'')+(i===index?'current':'')} aria-label={`Discovery ${i+1}`} aria-current={i===index?'step':undefined} disabled={i>rounds} onClick={()=>onJump(i)}><span>{a?(a.outcome==='skipped'?'↷':a.correct?'★':'✦'):i+1}</span><small>{i===index?'You are here':a?(a.outcome==='skipped'?'Skipped':a.correct?'Solved':'Revisit'):i===deck.length-1?'Finish':'Mystery '+(i+1)}</small></button>})}</div></nav>;
}
