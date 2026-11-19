import {mountFamily} from '../shared/Family.jsx';
import core from '../../../static/js/latin-quest-core.js';
import '../shared/legacy.jsx';
import './style.css';
import '../../../static/js/labs-players.css';
import {gamePlayerId, mountPlayers, profiles, selectedPlayers} from '../../../static/js/labs-players.js';
async function boot(){
 window.LatinQuestCore=core;
 window.LatinQuestPlayers={gamePlayerId,mountPlayers,profiles,selectedPlayers};
 await import('../../../static/js/latin-quest.js');
 mountFamily();
 const setup=document.getElementById('lq-setup');if(!setup)return;
 const quick=document.getElementById('latin-quick'),primary=document.createElement('div');primary.className='lq-primary-options';
 const grid=document.createElement('div');grid.className='lq-grid';
 for(const id of ['lq-mode','lq-word-type','lq-response']){const parent=document.getElementById(id)?.parentElement;if(parent)grid.append(parent)}
 primary.append(grid);
 const reviewed=document.getElementById('lq-reviewed-only')?.closest('.lq-row');if(reviewed)primary.append(reviewed);
 const count=document.getElementById('lq-reviewed-count');if(count)primary.append(count);
 // Quick Start lives inside the illustrated Roman welcome panel. It is not
 // a direct child of #lq-setup, so insertBefore(primary, quick) would throw a
 // NotFoundError and leave the entire Latin page half-initialized.
 const welcome=quick?.closest('.lq-roman-welcome');
 const directQuick=quick?.parentElement===setup?quick:null;
 const directWelcome=welcome?.parentElement===setup?welcome:null;
 const romanPaths=[...setup.children].filter(node=>node.classList?.contains('lq-roman-paths'));
 const romanHeading=[...setup.children].find(node=>node.classList?.contains('lq-roman-config-title'));
 if(romanHeading)romanHeading.after(primary);
 else if(directQuick)setup.insertBefore(primary,directQuick);
 else setup.prepend(primary);
 const drawer=document.createElement('details');drawer.className='labs-options';
 const heading=document.createElement('summary');heading.textContent='Practice options';
 drawer.append(heading);
 // Keep the welcome, clickable paths, and section heading visible. Only move
 // the actual setup fields into the advanced-options drawer.
 const keep=new Set([primary,directQuick,directWelcome,romanHeading,...romanPaths].filter(Boolean));
 for(const node of [...setup.children])if(!keep.has(node))drawer.append(node);
 setup.append(drawer);
 const study=document.getElementById('lq-study');if(study){const details=document.createElement('details');details.className='lq-study-drawer';const summary=document.createElement('summary');summary.textContent='Ask about a word';details.append(summary);[...study.children].forEach(n=>details.append(n));study.append(details)}
}
boot();
