import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './history.css';

const mount = document.getElementById('history-selection');
const form = document.getElementById('bulkDeleteForm');
if (mount && form) {
  const rows = [...form.querySelectorAll('.row-check')];
  const visible = row => !row.closest('.card').hidden;
  const checked = () => rows.filter(row => visible(row) && row.checked);
  const key = list => list.map(row => row.value).sort().join('\n');
  function Selection() {
    const [selected, setSelected] = useState(checked);
    const [review, setReview] = useState(false);
    const [count, setCount] = useState(rows.filter(visible).length);
    const all = useRef(null);
    const approved = useRef(null);
    const heading = useRef(null);
    const deleteButton = useRef(null);
    useEffect(() => {
      function sync() {
        // A hidden checkbox is still submitted by the browser. Clear it explicitly.
        rows.forEach(row => { if (!visible(row)) row.checked = false; });
        setSelected(checked()); setCount(rows.filter(visible).length);
        setReview(false); approved.current = null;
      }
      function submit(event) {
        // Individual worksheet delete buttons retain their existing route.
        if (event.submitter?.hasAttribute('formaction')) return;
        const current = checked();
        if (!current.length || approved.current !== key(current)) {
          event.preventDefault(); sync(); return;
        }
        rows.forEach(row => { if (!visible(row)) row.checked = false; });
        approved.current = null;
      }
      form.addEventListener('change', sync);
      form.addEventListener('submit', submit, true);
      document.addEventListener('history:filtered', sync);
      sync();
      return () => {form.removeEventListener('change', sync); form.removeEventListener('submit', submit, true); document.removeEventListener('history:filtered', sync);};
    }, []);
    useEffect(() => { if (all.current) all.current.indeterminate = selected.length > 0 && selected.length < count; }, [selected, count]);
    useEffect(() => {if (review) heading.current?.focus();}, [review]);
    return <>
      <div className="history-selection-row">
        <label className="checkrow"><input ref={all} type="checkbox" checked={count > 0 && selected.length === count} disabled={!count} onChange={event => {rows.filter(visible).forEach(row => {row.checked = event.target.checked;}); form.dispatchEvent(new Event('change', {bubbles: true}));}} />Select visible</label>
        <span role="status" aria-live="polite">{selected.length} selected</span>
        <button type="button" className="button delete" disabled={!selected.length} ref={deleteButton} onClick={() => setReview(true)}>Delete selected</button>
      </div>
      <p className="small muted">Filtering clears selections that leave the results.</p>
      {review && <section className="history-delete-review" aria-labelledby="delete-review-heading">
        <h2 id="delete-review-heading" tabIndex={-1} ref={heading}>Delete {selected.length} {selected.length === 1 ? 'worksheet' : 'worksheets'}?</h2>
        <p>These worksheets will be permanently deleted.</p>
        <ul>{selected.map(row => <li key={row.value}>{row.closest('.card').querySelector('.title')?.dataset.title || row.value}</li>)}</ul>
        <div className="history-selection-row"><button type="button" className="button ghost" onClick={() => {setReview(false); deleteButton.current?.focus();}}>Cancel</button><button type="submit" className="button delete" onClick={() => {approved.current = key(selected);}}>Confirm deletion</button></div>
      </section>}
    </>;
  }
  createRoot(mount).render(<Selection />);
}
