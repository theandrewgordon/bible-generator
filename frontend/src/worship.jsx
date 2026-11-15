import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createServiceSaver } from './save-service.js';
import './worship.css';
const mount = document.getElementById('worship-save-feedback');
if (mount) {
  // Register before React's first effect so a fast click cannot lose a save.
  let publish = () => {};
  let latest = {kind: 'idle', message: ''};
  function update(status) {latest = status; publish(status);}
  document.addEventListener('worship:changed', event => {
    if (latest.kind === 'pending') update({kind: 'pending', message: 'Saving the earlier service snapshot. Current edits remain available.'});
    else update({kind: 'idle', message: event.detail.dirty ? 'You have unsaved changes.' : ''});
  });
  const save = createServiceSaver({fetcher: (...args) => fetch(...args), notify: status => {latest = status; publish(status);}});
  document.addEventListener('worship:save', event => {void save(event.detail);});
  function SaveStatus() {
    const [status, setStatus] = useState(latest);
    useEffect(() => {publish = setStatus; setStatus(latest); return () => {publish = () => {};};}, []);
    return status.message ? <p className={`worship-save-status ${status.kind}`} role={status.kind === 'error' ? 'alert' : 'status'} aria-live={status.kind === 'error' ? 'assertive' : 'polite'}>{status.message}</p> : null;
  }
  createRoot(mount).render(<SaveStatus />);
  document.dispatchEvent(new Event('worship:save-ready'));
}
