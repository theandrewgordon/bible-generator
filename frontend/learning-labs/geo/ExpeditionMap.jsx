import React from 'react';
import exploreEverythingIcon from './art/explore-everything.webp';
import {QuickStart} from '../shared/widgets.jsx';
const worldTitle='Around the World';
const places=[
 {topic:'Water & coasts',art:'art-beach',x:18,y:64,description:'Follow the water from quiet shores to the open sea.'},
 {topic:'Land & ice',art:'art-mountain',x:47,y:30,description:'Head for the heights, icy valleys and wide-open land.'},
 {topic:'Living landscapes',art:'art-forest',x:82,y:25,description:'Step into green places and discover what grows there.'},
 {topic:'Man-Made Features',art:'art-canal',x:81,y:67,description:'Explore canals, dams and other features people build.'},
 {topic:'Maps & our planet',art:'art-altitude',iconArt:'art-diagram-compass',x:48,y:81,description:'Find your bearings and see our world in a new way.'},
 {topic:'Changing Earth',art:'art-volcano',x:18,y:35,description:'Look for the forces that shape a changing planet.'}
];
export function ExpeditionMap({topic,mode,onTopic,onMode,onStart,onResume,resume,pending,onReview,available,needsMoreQuestions,startLabel,worldOpen,onWorld,regions,branch,trail,onTrail,regionPanelRef}){
 const place=places.find(p=>p.topic===topic);
 return <section className="expedition-board" aria-label="Choose an expedition">
  <div className="world-map">
   <div className="map-heading"><span>EXPEDITION MAP</span><h2>Where shall we explore?</h2><p>Tap a place on the map to choose your trail.</p></div>
   <svg className="map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M18 35 C25 28 36 29 47 30 S72 20 82 25 C95 32 95 56 81 67 S62 83 48 81 S23 77 18 64 Q28 54 50 50 Q31 50 18 35 Z"/></svg>
   {places.map(p=><button key={p.topic} className={'map-stop '+(!worldOpen&&topic===p.topic?'selected':'')} style={{'--x':p.x+'%','--y':p.y+'%'}} aria-pressed={!worldOpen&&topic===p.topic} onClick={()=>onTopic(p.topic)}><span className="map-stop-icon" aria-hidden="true"><span className={p.iconArt||p.art}/></span><span className="map-stop-label">{p.topic.replace(/\band\b/gi,"&")}</span>{!worldOpen&&topic===p.topic&&<span className="map-selected" aria-hidden="true">⚑</span>}</button>)}
   <button className={'map-stop map-stop-world '+(worldOpen?'selected':'')} style={{'--x':'50%','--y':'50%'}} aria-pressed={worldOpen} onClick={onWorld}><span className="map-stop-icon" aria-hidden="true"><span className="art-earth"/></span><span className="map-stop-label">{worldTitle}</span>{worldOpen&&<span className="map-selected" aria-hidden="true">⚑</span>}</button>
   <button className="all-trails" aria-pressed={!worldOpen&&topic==='all'} onClick={()=>onTopic('all')}><img src={exploreEverythingIcon} alt="" width="48" height="48"/><span>Explore Everything</span></button>
  </div>
  <aside className="mission-card">
   {worldOpen?<section className="world-destination-panel" ref={regionPanelRef} tabIndex={-1} aria-labelledby="world-destinations-title">
    <div className="mission-picture"><div className="landscape art-earth" aria-hidden="true"/><span className="mission-pin" aria-hidden="true">✦</span></div>
    <h2 id="world-destinations-title" className="world-destinations-title">{worldTitle}</h2>
    <p>Choose a destination and trail to begin exploring.</p>
    <nav className="geo-branches" aria-labelledby="world-destinations-title">{regions}</nav>
    {branch&&<div className="world-trail-controls">
     <label className="world-trail-select">Choose a trail in {branch.name}
      <select value={trail} onChange={event=>onTrail(event.target.value)}>
       <option value="all">All trails</option>
       {branch.trails.map(([name])=><option key={name} value={name}>{name}</option>)}
      </select>
     </label>
     <p className="world-trail-count">{available} geography {available===1?'mystery':'mysteries'} ready to explore</p>
     <QuickStart heading={trail==='all'?branch.name:trail} kicker="PLACE GEOGRAPHY"
      description="Choose a trail and start your expedition." startLabel={startLabel}
      disabled={!available} onStart={onStart} resume={resume} onResume={onResume}/>
     {!available&&<p className="mission-empty" role="status">{needsMoreQuestions?'Choose a broader trail so every explorer gets a turn.':'No mysteries match these options. Choose another trail.'}</p>}
     {pending>0&&<button className="world-review-button" onClick={onReview}>✦ Review missed discoveries ({pending})</button>}
    </div>}
   </section>:<>
   <div className="mission-tabs" aria-label="Choose your adventure"><button aria-pressed={mode==='quest'} onClick={()=>onMode('quest')}>Quest</button><button aria-pressed={mode==='compare'} onClick={()=>onMode('compare')}>⛰ Compare</button></div>
   <div className="mission-picture"><div className={'landscape '+(place?.art||'art-mountain')} role="img" aria-label={place?.topic||'Watercolor mountain landscape'}/><span className="mission-pin" aria-hidden="true">✦</span></div>
   <p className="mission-location">{place?.topic||'The whole wide world'}</p>
   <QuickStart startLabel={startLabel} disabled={!available} heading={mode==='compare'?'Spot the difference!':'Your mystery awaits…'} kicker="PACK YOUR CURIOSITY" onStart={onStart} onResume={onResume} resume={resume} description={mode==='compare'?'Two landscapes. What makes them alike—and different?':place?.description||'Three sealed clues per mystery. Let curiosity lead the way.'}/>
   {!available&&<p className="mission-empty" role="status">{needsMoreQuestions?'Choose a broader trail so every player gets a turn.':'No mysteries match these options. Choose “All trails” under “More Say in How You Play”, or try another place.'}</p>}
   <button className="review-postcard" disabled={!pending} onClick={onReview}>✦ Explore again <span>{pending?`${pending} discoveries to revisit`:'Your review trail will grow as you play'}</span></button>
   </>}
  </aside>
 </section>;
}
export function TrailMap({deck,index,answers,rounds,onJump}){
 const size=Math.min(deck.length,5),start=Math.floor(index/size)*size,visible=deck.slice(start,start+size);
 return <nav className="discovery-map" aria-label="Discovery map"><div className="trail-caption"><span>YOUR DISCOVERY TRAIL</span><b>{Object.keys(answers).length} / {deck.length} discoveries</b></div><div className="trail-steps"><svg viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true"><path d="M30 35 Q140 0 250 35 T470 35 T690 35 T910 35 L970 35"/></svg>{visible.map((entry,j)=>{const i=start+j,a=answers[entry.id];return <button key={entry.id} className={(a?'visited ':'')+(i===index?'current':'')} aria-label={`Discovery ${i+1}`} aria-current={i===index?'step':undefined} disabled={i>rounds} onClick={()=>onJump(i)}><span>{a?(a.outcome==='skipped'?'↷':a.correct?'★':'✦'):i+1}</span><small>{i===index?'You are here':a?(a.outcome==='skipped'?'Skipped':a.correct?'Solved':'Revisit'):i===deck.length-1?'Finish':'Mystery '+(i+1)}</small></button>})}</div></nav>;
}
