import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import {FileReady,receiveDownload} from './file-ready.jsx';
import './worksheet.css';

const mount = document.getElementById('worksheet-preview');
const form = document.getElementById('worksheetForm');
if (mount && form) {
  const read = () => JSON.parse(mount.dataset.state || '{"verses":[],"version":"WEB","level":"growing","cursive":false,"title":"","text":"","prompt":""}');
  const submit = document.getElementById('submitBtn');
  const quotaDisabled = submit.disabled;
  // Show the useful side-by-side preview on larger screens; keep it collapsible on phones.
  if (window.matchMedia?.('(min-width: 981px)').matches) mount.closest('details').open = true;
  function WorksheetEditor() {
    const [state, setState] = useState(read);
    const [index, setIndex] = useState(0);
    const [status, setStatus] = useState({kind: 'idle', message: ''});
    const [ready,setReady] = useState(null);
    const busy = useRef(false);
    useEffect(()=>()=>{if(ready)URL.revokeObjectURL(ready.url);},[ready]);
    const error = useRef(null);
    useEffect(() => {
      const change = () => { setState(read()); setIndex(0); if (!busy.current) setStatus({kind: 'idle', message: ''}); document.getElementById('verseInput')?.removeAttribute('aria-invalid'); };
      mount.addEventListener('worksheet:change', change);
      const onSubmit = async event => {
        event.preventDefault();
        if (busy.current || quotaDisabled) return;
        const current = read();
        let message = '';
        if (!current.verses.length && !current.text.trim()) message = 'Enter a Bible reference or add your own text before creating a worksheet.';
        else if (current.text.trim() && !form.elements.namedItem('agreeTerms')?.checked) message = 'Confirm that your custom text is appropriate and family-friendly.';
        if (message) {
          if (current.text.trim()) document.getElementById('customBlock')?.setAttribute('open', '');
          document.getElementById('verseInput')?.setAttribute('aria-invalid', String(!current.verses.length && !current.text.trim()));
          setStatus({kind: 'error', message}); return;
        }
        busy.current = true;
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        setStatus({kind: 'pending', message: 'Verifying your text and creating the download…'});
        try {
          // Usage-chip storage is optional and must never block generation.
          try { sessionStorage.setItem('genPending', '1'); sessionStorage.setItem('genPendingFocus', '1'); } catch {}
          const payload = new FormData(form);
          payload.set('verse', current.verses.join(', '));
          const response = await fetch(form.action, {method: 'POST', body: payload, credentials: 'same-origin', headers: {Accept: 'application/pdf, application/zip, application/octet-stream'}});
          const fallback = (current.verses[0] || current.title || 'worksheet').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'worksheet';
          const file = await receiveDownload(response,fallback);
          setReady(file);
          setStatus({kind:'success',message:''});
          form.dispatchEvent(new CustomEvent('worksheet:created', {detail: {verse: current.verses[0] || ''}}));
          window.refreshUsageChip?.();
        } catch (failure) {
          setStatus({kind: 'error', message: failure instanceof TypeError ? 'Could not connect. Check your connection and try again; your choices are still here.' : failure.message || 'Could not create the worksheet. Please try again.'});
        } finally {
          busy.current = false;
          submit.disabled = quotaDisabled;
          form.removeAttribute('aria-busy');
        }
      };
      form.addEventListener('submit', onSubmit);
      return () => {mount.removeEventListener('worksheet:change', change); form.removeEventListener('submit', onSubmit);};
    }, []);
    useEffect(() => {if (status.kind === 'error') error.current?.focus();}, [status]);
    const items = state.verses.map(verse => ({title: verse, custom: false}));
    if (state.text.trim()) items.push({title: state.title.trim() || 'Your own text', custom: true});
    const item = items[Math.min(index, Math.max(items.length - 1, 0))];
    const lineCount = {beginner: 5, growing: 3, confident: 2}[state.level] || 3;
    const content = item?.custom ? state.text : 'Exact Scripture text will appear in the finished PDF after verification.';
    return <>
      <div className="worksheet-preview-top"><h3>Worksheet preview</h3><span className="pill">{items.length || 1} {items.length > 1 ? 'worksheets' : 'worksheet'}</span></div>
      {items.length > 1 && <div className="worksheet-preview-nav" aria-label="Preview worksheets">
        <button type="button" className="button ghost small" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
        <span>{index + 1} of {items.length}</span>
        <button type="button" className="button ghost small" disabled={index >= items.length - 1} onClick={() => setIndex(index + 1)}>Next</button>
      </div>}
      <div className="preview-sheet">
        <div className="preview-sheet-title">Bible Copywork Worksheet</div>
        <div className="preview-header"><div className="preview-verse">{item?.title || 'Choose a passage'}</div><div className="preview-badges"><span className="pill alt">{item?.custom ? 'Custom text' : (/\(([A-Z0-9]{2,12})\)/i.exec(item?.title || '')?.[1]?.toUpperCase() || state.version)}</span>{state.cursive && <span className="pill">Cursive</span>}</div></div>
        <div className="preview-section"><strong>Copy this {item?.custom ? 'text' : 'verse'}</strong><div className="preview-copy-box">{content}</div></div>
        <div className="preview-section"><strong>Trace the {item?.custom ? 'text' : 'verse'}</strong><div className="preview-trace">{item?.custom ? state.text : 'Traceable handwriting appears in the finished PDF.'}</div></div>
        <div className="preview-section"><strong>Write it yourself</strong><div className="preview-writing-lines">{Array.from({length: lineCount}, (_, i) => <i key={i} />)}</div></div>
        <div className="preview-bottom"><div className="preview-section"><strong>Think about this</strong><p className="muted small">A reflection question appears in the finished PDF.</p></div><div className="preview-section"><strong>Coloring prompt</strong><p className="muted small">{item?.custom && state.prompt.trim() ? state.prompt : 'Created for your passage'}</p><div className="preview-color-box" /></div></div>
      </div>
      <p className="muted micro">Layout preview. Exact Scripture text, illustration, and line wrapping appear in the downloaded file.</p>
      {createPortal(<div className={`worksheet-feedback ${status.kind}`}>
        <FileReady file={ready} onEdit={()=>{setReady(null);document.getElementById('verseInput')?.focus();}} />
        {status.kind === 'error' ? <div role="alert" tabIndex={-1} ref={error}><strong>Let’s fix that</strong><p>{status.message}</p><p className="small">Your choices are preserved. You can edit them and try again.</p></div> : <p role="status" aria-live="polite">{status.message}</p>}
      </div>, document.getElementById('worksheet-feedback'))}
    </>;
  }
  createRoot(mount).render(<WorksheetEditor />);
}
