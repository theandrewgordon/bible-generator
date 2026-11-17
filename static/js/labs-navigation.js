/* Shared learning-game navigation. Shared links contain no learner data or tracking. */
export const GAMES=[['geo','Geo Detectives','/labs/geo-detectives'],['math','Math Fact Adventure','/labs/math-fact-adventure'],['latin','Latin Quest','/labs/latin-quest'],['grammar','Grammar Grove','/labs/grammar-grove']];
export function gameUrl(game){return 'https://faithsparksprintables.com'+(GAMES.find(([id])=>id===game)?.[2]||'/labs')}
export async function copyGameLink(game,clipboard=globalThis.navigator?.clipboard){if(!clipboard?.writeText)throw Error('clipboard_unavailable');await clipboard.writeText(gameUrl(game));return gameUrl(game)}
export function mountNavigation(root,game){
 if(!root)return;
 const nav=document.createElement('nav');nav.className='labs-family';nav.setAttribute('aria-label','FaithSparks learning games');
 const brand=document.createElement('a');brand.className='labs-brand';brand.href='/labs';brand.textContent='✦ FaithSparks LABS';nav.appendChild(brand);
 const links=document.createElement('div');for(const [id,title,url]of GAMES){const a=document.createElement('a');a.href=url;a.textContent=title;if(id===game)a.setAttribute('aria-current','page');links.appendChild(a)}
 const button=document.createElement('button');button.type='button';button.className='labs-share';button.textContent='Copy game link';button.setAttribute('aria-label','Copy game link to share');links.appendChild(button);
 const status=document.createElement('span');status.className='labs-copy-status';status.setAttribute('role','status');links.appendChild(status);
 const fallback=document.createElement('label');fallback.className='labs-share-fallback';fallback.hidden=true;fallback.textContent='Copy this game link';const input=document.createElement('input');input.readOnly=true;input.value=gameUrl(game);input.addEventListener('focus',()=>input.select());fallback.appendChild(input);links.appendChild(fallback);
 button.addEventListener('click',async()=>{try{await copyGameLink(game);fallback.hidden=true;status.textContent='Link copied. Learner names, scores and progress stay on this device.'}catch{fallback.hidden=false;status.textContent='Select and copy the link below.';input.focus();input.select()}});
 nav.appendChild(links);root.replaceChildren(nav);
}
