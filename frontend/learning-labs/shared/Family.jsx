import React from 'react';
import {createRoot} from 'react-dom/client';
import './family.css';
export function Family({game}){return <nav className="labs-family" aria-label="FaithSparks learning games"><a className="labs-brand" href="/labs"><span aria-hidden="true">✦</span> FaithSparks <small>LABS</small></a><div>{[['geo','Geo Detectives','/labs/geo-detectives'],['math','Math Adventure','/labs/math-fact-adventure'],['latin','Latin Quest','/labs/latin-quest']].map(([id,title,url])=><a key={id} href={url} aria-current={id===game?'page':undefined}>{title}</a>)}</div></nav>}
export function mountFamily(){const node=document.getElementById('labs-family');if(node)createRoot(node).render(<Family game={node.dataset.game}/>)}
