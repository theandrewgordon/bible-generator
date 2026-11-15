import {mountFamily} from '../shared/Family.jsx';
import core from '../../../static/js/latin-quest-core.js';
import '../shared/legacy.jsx';
import './style.css';
async function boot(){
window.LatinQuestCore=core;
await import('../../../static/js/latin-quest.js');
mountFamily();
// Keep established study controls and saved progress while making setup easier to scan.
const setup=document.getElementById('lq-setup');
if(setup){
 const drawer=document.createElement('details');drawer.className='labs-options';const heading=document.createElement('summary');heading.textContent='Practice options';drawer.append(heading);[...setup.children].filter(n=>n.id!=='latin-quick').forEach(n=>drawer.append(n));setup.append(drawer);
 const title=document.createElement('p');title.className='lq-tag';title.textContent='YOUR NEXT LANGUAGE EXPEDITION';drawer.append(title);
 const advanced=document.createElement('details');advanced.className='lq-advanced';const summary=document.createElement('summary');summary.textContent='Fine-tune your quest';advanced.append(summary);
 const grid=drawer.querySelector('.lq-grid');
 for(const id of ['lq-voice','lq-pronunciation']){const parent=document.getElementById(id)?.parentElement;if(parent)advanced.append(parent)}
 for(const node of [...drawer.children]){if(node.tagName==='DETAILS'||node.querySelector('#lq-focus,#lq-details,#lq-auto'))advanced.append(node)}
 grid.after(advanced);
 const study=document.getElementById('lq-study');if(study){const details=document.createElement('details');details.className='lq-study-drawer';const summary=document.createElement('summary');summary.textContent='Curious about a word? Ask the card set';details.append(summary);[...study.children].forEach(n=>details.append(n));study.append(details)}
}

}
boot();
