import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {GAMES,gameUrl,copyGameLink,rememberLearning} from '../../../static/js/labs-navigation.js';
import './family.css';
export function Family({game}){
 useEffect(()=>rememberLearning(game),[game]);
 const [status,setStatus]=useState(''),[fallback,setFallback]=useState(false);
 async function copy(){try{await copyGameLink(game);setStatus('Link copied. Learner names, scores and progress stay on this device.');setFallback(false)}catch{setFallback(true);setStatus('Select and copy the link below.')}}
 return <nav className="labs-family" aria-label="FaithSparks learning games"><a className="labs-brand" href="/labs/learningadventure"><span aria-hidden="true">✦</span> FaithSparks <small>Learning Adventure</small></a><div>{GAMES.map(([id,title,url])=><a key={id} href={url} aria-current={id===game?'page':undefined}>{title}</a>)}<button className="labs-share" type="button" onClick={copy} aria-label="Copy game link to share">Copy game link</button><span className="labs-copy-status" role="status">{status}</span>{fallback&&<label className="labs-share-fallback">Copy this game link<input readOnly value={gameUrl(game)} onFocus={e=>e.target.select()}/></label>}</div></nav>
}
export function mountFamily(){const node=document.getElementById('labs-family');if(node)createRoot(node).render(<Family game={node.dataset.game}/>)}
