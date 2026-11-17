import {mountFamily} from '../shared/Family.jsx';
import '../shared/legacy.jsx';
import './engine.js';
import {attachVoice,stopVoice} from '../shared/voice.js';
attachVoice(document.getElementById('mathVoice'),'math',()=>[document.getElementById('math').textContent,...[...document.querySelectorAll('#mathChoices:not(.hidden) button')].map(b=>b.textContent)].join('. '));
attachVoice(document.getElementById('mathHintVoice'),'math',()=>document.getElementById('hint').textContent);
attachVoice(document.getElementById('mathAnswerVoice'),'math',()=>document.getElementById('answer').textContent+'. '+document.getElementById('message').textContent);
new MutationObserver(stopVoice).observe(document.getElementById('math'),{childList:true});
mountFamily();
