import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import './gathering.css';

const form = document.getElementById('lesson-pack-form');
const mount = document.getElementById('gathering-controls');
if (form && mount) {
  const config = JSON.parse(document.getElementById('gathering-config').textContent);
  const field = name => form.elements.namedItem(name);
  const keys = {lesson_mode: 'lessonPackMode', session_minutes: 'lessonPackMinutes', version: 'preferredVersion', age_bracket: 'lessonPackAge', use_cursive: 'lessonPackCursive', include_coloring: 'lessonPackColoring'};
  // Storage is optional: private browsing and blocked storage must still work.
  {
    try {
      Object.entries(keys).forEach(([name, key]) => {
        const queryKey = {lesson_mode:'mode',session_minutes:'minutes',age_bracket:'age',use_cursive:'cursive',include_coloring:'coloring'}[name] || name;
        if (config.providedFields ? config.providedFields.includes(queryKey) : config.fromUrl) return;
        const value = name === 'use_cursive' ? (localStorage.getItem('useCursive') === null ? localStorage.getItem(key) : localStorage.getItem('useCursive') === 'true' ? '1' : '0') : localStorage.getItem(key), input = field(name);
        if (value === null) return;
        if (input.type === 'checkbox') input.checked = value === '1';
        else if ([...input.options].some(option => !option.disabled && option.value === value)) input.value = value;
      });
    } catch { /* The server defaults remain usable. */ }
  }
  const read = () => Object.fromEntries(['verse', ...Object.keys(keys)].map(name => [name, field(name).type === 'checkbox' ? field(name).checked : field(name).value]));
  const steps = [...form.querySelectorAll('[data-builder-step]')];
  function Builder() {
    const [step, setStep] = useState(0);
    const [values, setValues] = useState(read);
    const [busy, setBusy] = useState(false);
    const heading = useRef(null);
    const first = useRef(true);
    useEffect(() => {
      const change = event => {
        if (event.target.name === 'verse') event.target.setCustomValidity('');
        setValues(read());
        const key = keys[event.target.name];
        if (event.target.name === 'use_cursive') try {localStorage.setItem('useCursive',String(event.target.checked));} catch {}
        if (key) try { localStorage.setItem(key, event.target.type === 'checkbox' ? (event.target.checked ? '1' : '0') : event.target.value); } catch { /* Optional preferences only. */ }
      };
      const invalid = event => {
        const section = event.target.closest('[data-builder-step]');
        if (section) { setStep(steps.indexOf(section)); requestAnimationFrame(() => event.target.focus()); }
      };
      const restore = () => setBusy(false);
      form.addEventListener('input', change);
      form.addEventListener('change', change);
      form.addEventListener('invalid', invalid, true);
      window.addEventListener('pageshow', restore);
      form.querySelector('[data-fallback-actions]').hidden = true;
      return () => {
        form.removeEventListener('input', change); form.removeEventListener('change', change);
        form.removeEventListener('invalid', invalid, true); window.removeEventListener('pageshow', restore);
      };
    }, []);
    useEffect(() => {
      steps.forEach((section, index) => { section.hidden = index !== step; });
      if (!first.current) heading.current?.focus();
      first.current = false;
    }, [step]);
    useEffect(() => {
      const family = values.lesson_mode === 'family';
      const copy = (selector,text) => {const node=document.querySelector(selector);if(node)node.textContent=text;};
      copy('[data-pack-title]',family?'A family Scripture week from one passage':'A ready-to-lead gathering from one passage');
      copy('[data-pack-lede]',family?'Get a five-day family guide, copywork worksheet, word search, and answer key in one PDF. Scripture is verified before building.':'Get an all-age gathering plan, copywork worksheet, word search, and answer key in one PDF. Scripture is verified before building.');
      copy('[data-pack-aside-title]',family?'Ready for your family’s week':'Ready for your gathering');
      copy('[data-pack-guide]',family?'Five-day family guide':'Leader gathering plan');
      copy('[data-pack-aside-note]',family?'Read, talk, practice, and pray together across five short days.':'Roles for young children, readers, teens, and adults keep everyone together.');
      form.querySelector('[data-session-field]').hidden = values.lesson_mode !== 'house-church';
      form.querySelector('#lesson-pack-mode-note').textContent = config.modes[values.lesson_mode]?.description || '';
      const notes = {'3-5': 'Large writing space; simplest word search.', '6-8': 'More writing practice; forward-or-backward word search.', '9-10': 'Deeper reflection; words in every direction.', '10+': 'Context study; larger challenge grid.'};
      form.querySelector('#lesson-pack-age-note').textContent = notes[values.age_bracket] || '';
    }, [values]);
    useEffect(() => {
      const submit = event => {
        if (busy) { event.preventDefault(); return; }
        if (step !== 2) { event.preventDefault(); next(); return; }
        setBusy(true);
      };
      form.addEventListener('submit', submit);
      return () => form.removeEventListener('submit', submit);
    }, [step, busy]);
    function next() {
      if (step === 0) field('verse').setCustomValidity(field('verse').value.trim() ? '' : 'Enter a Bible passage.');
      const invalid = [...steps[step].querySelectorAll('input, select')].find(input => !input.checkValidity());
      if (invalid) { invalid.reportValidity(); return; }
      setStep(Math.min(step + 1, 2));
    }
    const modeLabel = config.modes[values.lesson_mode]?.label || 'Gathering';
    return <>
      {createPortal(<nav className="gathering-steps" aria-label="Build your gathering">
        {['Passage', 'Printables', 'Review'].map((label, index) => <button key={label} type="button" disabled={busy || index > step} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}
      </nav>, document.getElementById('gathering-step-nav'))}
      {createPortal(<h2 ref={heading} tabIndex={-1} className="gathering-step-title">{['Choose your passage', 'Make it fit your group', 'Review your gathering'][step]}</h2>, document.getElementById('gathering-step-heading'))}
      <section hidden={step !== 2} className="gathering-review" aria-label="Review your choices">
        <p className="kicker">Your pack at a glance</p>
        <h3>{values.verse.trim() || 'Choose a passage'}</h3>
        <dl>
          <div><dt>Format</dt><dd>{modeLabel}{values.lesson_mode === 'house-church' ? ` · ${values.session_minutes} minutes` : ''}</dd></div>
          <div><dt>Bible version</dt><dd>{field('version').selectedOptions[0]?.textContent.trim()}</dd></div>
          <div><dt>Worksheet focus</dt><dd>Ages {values.age_bracket}</dd></div>
          <div><dt>Writing</dt><dd>{values.use_cursive ? 'Cursive tracing' : 'Print tracing'}</dd></div>
          <div><dt>Coloring page</dt><dd>{values.include_coloring ? 'Included · takes longer to create' : 'Not included'}</dd></div>
        </dl>
        <p>{values.lesson_mode === 'family' ? 'Five-day family guide' : 'Leader gathering plan'}, copywork worksheet, word search, and answer key in a printable PDF.</p>
        <p className="muted small">This is a summary of your choices. Scripture is verified and the printables are created when you build.</p>
      </section>
      <div className="gathering-actions">
        {step > 0 && <button type="button" className="button ghost" disabled={busy} onClick={() => setStep(step - 1)}>Back</button>}
        {step < 2 ? <button key="next" type="button" className="button primary" onClick={next}>Continue to {step === 0 ? 'printables' : 'review'}</button> : <button key="build" type="submit" className="button primary" disabled={busy}>{busy ? (config.signedIn ? 'Building your pack…' : 'Opening sign in…') : (config.signedIn ? 'Build gathering pack' : 'Sign in to build')}</button>}
      </div>
      {config.worksheetUrl && <a className="small" href={config.worksheetUrl}>Just make a worksheet</a>}
      <p className="small muted">{values.include_coloring ? 'The optional coloring illustration can take a minute or two longer.' : 'Your pack is built after Scripture verification.'}</p>
      {busy && <p id="lesson-pack-progress" role="status" aria-live="polite">{config.signedIn ? 'Verifying the passage and building your printables…' : 'Saving your choices for sign in…'}</p>}
    </>;
  }
  createRoot(mount).render(<Builder />);
}
