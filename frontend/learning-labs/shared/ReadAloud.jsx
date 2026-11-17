import React,{useEffect,useState} from 'react';
import {readVoice,stopVoice} from './voice.js';
export function ReadAloud({text,game,label='Read it to me',resetKey}){
 const [status,setStatus]=useState('');
 useEffect(()=>{setStatus('');stopVoice();return ()=>stopVoice()},[resetKey,text]);
 return <div className="labs-read-aloud"><button type="button" className="subtle labs-voice-button" onClick={()=>readVoice(text,game,setStatus)}><span aria-hidden="true">♫ </span>{label}</button><span className="labs-voice-status" role="status">{status}</span></div>;
}
