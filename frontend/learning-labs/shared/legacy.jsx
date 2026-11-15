// Small adapter lets established controllers use the same React components as Geo.
import React from 'react';import {numberChoices,outcomeCounts} from './practice.js';import {createRoot} from 'react-dom/client';import {QuickStart,SessionStatus,LearningSummary} from './widgets.jsx';
const roots=new Map();
function render(id,content){const node=document.getElementById(id);if(!node)return;if(!roots.has(node))roots.set(node,createRoot(node));roots.get(node).render(content);}
window.LabsUI={choices:numberChoices,counts:outcomeCounts,quick:(game,props)=>render(game+'-quick',<QuickStart {...props}/>),status:(game,props)=>render(game+'-status',props?<SessionStatus {...props}/>:null),summary:(game,props)=>render(game+'-summary',props?<LearningSummary {...props}/>:null)};
