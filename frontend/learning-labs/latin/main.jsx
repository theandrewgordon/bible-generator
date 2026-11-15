import {mountFamily} from '../shared/Family.jsx';
import core from '../../../static/js/latin-quest-core.js';
import './style.css';
async function boot(){
window.LatinQuestCore=core;
await import('../../../static/js/latin-quest.js');
mountFamily();
// Keep established study controls and saved progress while making setup easier to scan.
const setup=document.getElementById('lq-setup');
if(setup){
 const title=document.createElement('p');title.className='lq-tag';title.textContent='YOUR NEXT LANGUAGE EXPEDITION';setup.prepend(title);
 const advanced=document.createElement('details');advanced.className='lq-advanced';const summary=document.createElement('summary');summary.textContent='Fine-tune your quest';advanced.append(summary);
 const grid=setup.querySelector('.lq-grid');
 for(const id of ['lq-voice','lq-pronunciation']){const parent=document.getElementById(id)?.parentElement;if(parent)advanced.append(parent)}
 for(const node of [...setup.children]){if(node.tagName==='DETAILS'||node.querySelector('#lq-focus,#lq-details,#lq-auto'))advanced.append(node)}
 grid.after(advanced);
 const study=document.getElementById('lq-study');if(study){const details=document.createElement('details');details.className='lq-study-drawer';const summary=document.createElement('summary');summary.textContent='Curious about a word? Ask the card set';details.append(summary);[...study.children].forEach(n=>details.append(n));study.append(details)}
}

}
boot();
