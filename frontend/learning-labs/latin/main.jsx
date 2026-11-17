import {mountFamily} from '../shared/Family.jsx';
import core from '../../../static/js/latin-quest-core.js';
import '../shared/legacy.jsx';
import './style.css';
async function boot(){
 window.LatinQuestCore=core;
 await import('../../../static/js/latin-quest.js');
 mountFamily();
 const setup=document.getElementById('lq-setup');if(!setup)return;
 const quick=document.getElementById('latin-quick'),primary=document.createElement('div');primary.className='lq-primary-options';
 const grid=document.createElement('div');grid.className='lq-grid';
 for(const id of ['lq-mode','lq-word-type','lq-response']){const parent=document.getElementById(id)?.parentElement;if(parent)grid.append(parent)}
 primary.append(grid);
 const reviewed=document.getElementById('lq-reviewed-only')?.closest('.lq-row');if(reviewed)primary.append(reviewed);
 const count=document.getElementById('lq-reviewed-count');if(count)primary.append(count);
 setup.insertBefore(primary,quick);
 const drawer=document.createElement('details');drawer.className='labs-options';const heading=document.createElement('summary');heading.textContent='Practice options';drawer.append(heading);
 for(const node of [...setup.children])if(node!==quick&&node!==primary)drawer.append(node);
 setup.append(drawer);
 const study=document.getElementById('lq-study');if(study){const details=document.createElement('details');details.className='lq-study-drawer';const summary=document.createElement('summary');summary.textContent='Ask about a word';details.append(summary);[...study.children].forEach(n=>details.append(n));study.append(details)}
}
boot();
