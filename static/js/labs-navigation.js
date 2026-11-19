import {labsStorage} from './labs-storage.js';
/* Shared learning-game navigation. Shared links contain no learner data or tracking. */
export const GAMES=[['geo','Geo Detectives','/labs/learningadventure/geo'],['math','Math Fact Adventure','/labs/learningadventure/math'],['latin','Latin Quest','/labs/learningadventure/latin'],['grammar','Grammar Grove','/labs/learningadventure/grammar']];
export function rememberLearning(game){if(GAMES.some(([id])=>id===game))try{labsStorage.setItem('faithsparks.learning.lastSubject',game)}catch{}}
export function gameUrl(game){return 'https://faithsparksprintables.com'+(GAMES.find(([id])=>id===game)?.[2]||'/labs')}
export async function copyGameLink(game,clipboard=globalThis.navigator?.clipboard){if(!clipboard?.writeText)throw Error('clipboard_unavailable');await clipboard.writeText(gameUrl(game));return gameUrl(game)}
export function mountNavigation(root,game){
 if(!root)return;rememberLearning(game);
 const nav=document.createElement('nav');nav.className='labs-family';nav.setAttribute('aria-label','FaithSparks learning games');
 const brand=document.createElement('a');brand.className='labs-brand';brand.href='/labs/learningadventure';const star=document.createElement('span');star.textContent='✦';star.setAttribute('aria-hidden','true');const small=document.createElement('small');small.textContent='LEARNING ADVENTURE';brand.append(star,' FaithSparks ',small);nav.appendChild(brand);
 const links=document.createElement('div');for(const [id,title,url]of GAMES){const a=document.createElement('a');a.href=url;a.textContent=title;if(id===game)a.setAttribute('aria-current','page');links.appendChild(a)}
 const button=document.createElement('button');button.type='button';button.className='labs-share';button.textContent='Copy game link';button.setAttribute('aria-label','Copy game link to share');links.appendChild(button);
 const status=document.createElement('span');status.className='labs-copy-status';status.setAttribute('role','status');links.appendChild(status);
 const fallback=document.createElement('label');fallback.className='labs-share-fallback';fallback.hidden=true;fallback.textContent='Copy this game link';const input=document.createElement('input');input.readOnly=true;input.value=gameUrl(game);input.addEventListener('focus',()=>input.select());fallback.appendChild(input);links.appendChild(fallback);
 button.addEventListener('click',async()=>{try{await copyGameLink(game);fallback.hidden=true;status.textContent='Link copied. Learner names, scores and progress stay on this device.'}catch{fallback.hidden=false;status.textContent='Select and copy the link below.';input.focus();input.select()}});
 nav.appendChild(links);root.replaceChildren(nav);
}
