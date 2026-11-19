import React from 'react';
import {createRoot} from 'react-dom/client';
import {GAMES} from '../../static/js/labs-navigation.js';
import {labsStorage} from '../../static/js/labs-storage.js';
import {ActionRow,ActionLink} from './ui.jsx';
const root=document.getElementById('learning-continuity');
if(root){
  let last=null;try{last=GAMES.find(([id])=>id===labsStorage.getItem('faithsparks.learning.lastSubject'));}catch{}
  if(last)createRoot(root).render(<ActionRow><ActionLink primary href={last[2]}>Return to {last[1]}</ActionLink><span className="small muted">Choose your learner inside the game.</span></ActionRow>);
}
