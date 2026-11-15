import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { importFileError } from './presentation-import.js';
import './presentation-upload.css';
const mount = document.getElementById('presentation-import-feedback');
if (mount) {
  const config = JSON.parse(document.getElementById('presentation-import-config').textContent);
  const form = document.getElementById('presentation-import-form');
  const file = document.getElementById('presentation-file');
  const button = document.getElementById('presentation-import-submit');
  const available = config.pdf || config.pptx;
  function Upload() {
    const [selected,setSelected] = useState(file.files?.[0]);
    const [error,setError] = useState('');
    const [pending,setPending] = useState(false);
    const [slow,setSlow] = useState(false);
    const busy = useRef(false);
    const alert = useRef(null);
    useEffect(()=>{
      let timer;
      const change = () => {const selected=file.files?.[0];setSelected(selected);setError(selected?importFileError(selected,config):'');file.removeAttribute('aria-invalid');};
      const restore = () => {busy.current=false;clearTimeout(timer);setPending(false);setSlow(false);button.disabled=!available;button.textContent='Import and review';form.removeAttribute('aria-busy');setSelected(file.files?.[0]);};
      const submit = event => {
        if (busy.current) {event.preventDefault();return;}
        const message=importFileError(file.files?.[0],config);
        if(message){event.preventDefault();setError(message);file.setAttribute('aria-invalid','true');return;}
        setError('');busy.current=true;setPending(true);button.disabled=true;button.textContent='Importing…';form.setAttribute('aria-busy','true');
        timer=window.setTimeout(()=>setSlow(true),20000);
      };
      file.addEventListener('change',change);form.addEventListener('submit',submit);window.addEventListener('pageshow',restore);
      return()=>{clearTimeout(timer);file.removeEventListener('change',change);form.removeEventListener('submit',submit);window.removeEventListener('pageshow',restore);};
    },[]);
    useEffect(()=>{if(error)alert.current?.focus();},[error]);
    return <>
      {selected&&!pending&&<p className="presentation-file-summary">{selected.name} · {(selected.size/1024/1024).toFixed(1)} MB selected. Slide count and file contents are checked by the server.</p>}
      {error&&<p className="presentation-upload-error" role="alert" ref={alert} tabIndex={-1}>{error}</p>}
      {pending&&<div className="presentation-upload-pending" role="status" aria-live="polite"><strong>Uploading and preparing your slides…</strong><p>{slow?'Still waiting for the server. Larger decks can take longer. Please keep this page open to avoid a duplicate import.':'The review page opens when conversion finishes. This may take a minute.'}</p></div>}
    </>;
  }
  createRoot(mount).render(<Upload />);
}
