import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import './games.css';
const mount = document.getElementById('game-word-controls');
if (mount) {
  const form = mount.closest('form');
  const field = id => document.getElementById(id);
  const wordArea = field('gameWords');
  const normalize = value => String(value || '').replace(/\\r\\n|\\\\n|\\n/g, '\n');
  wordArea.value = normalize(wordArea.value);
  field('references').value = normalize(field('references').value);
  const words = () => normalize(wordArea.value).split(/\n+/).map(word => word.trim()).filter(Boolean);
  const isWord = () => ['word-search', 'crossword'].includes(field('gameType').value);
  const defaults = {match: 'Match the Verse', 'match-meaning': 'Match the Meaning', 'word-search': 'Word Search', crossword: 'Crossword'};
  const topics = id => {try {return JSON.parse(field(id).textContent) || [];} catch {return [];}};
  field('suggestedTopicList').replaceChildren();
  if (!field('title').value.trim()) field('title').value = defaults[field('gameType').value];
  const pools = {match: topics('matchTopicsData'), word: topics('storyTopicsData')};
  function GameBuilder() {
    const [list, setList] = useState(words);
    const [mode, setMode] = useState(field('gameType').value);
    const [reviewed, setReviewed] = useState(false);
    const [pending, setPending] = useState(false);
    const [creating, setCreating] = useState(false);
    const generating = useRef(false);
    const [message, setMessage] = useState('Review your word list before creating the game.');
    const [offset, setOffset] = useState(0);
    const [refs, setRefs] = useState(field('references').value.trim());
    const revision = useRef(0);
    const request = useRef(null);
    const approval = useRef(false);
    const wordMode = ['word-search', 'crossword'].includes(mode);
    function invalidate(text = 'Choices changed. Review the updated word list.') {
      revision.current++; request.current?.abort(); request.current = null;
      approval.current = false; setReviewed(false); setPending(false);
      setList(words()); setRefs(field('references').value.trim()); setMode(field('gameType').value); setMessage(text);
    }
    useEffect(() => {
      const edit = event => {
        if (['references', 'version', 'difficulty', 'gameType', 'gameWords'].includes(event.target.id)) {
          if (event.target.id === 'gameType') {
            const title = field('title');
            if (!title.value.trim() || Object.values(defaults).includes(title.value)) title.value = defaults[field('gameType').value];
          }
          invalidate();
        }
      };
      let restoreTimer;
      const restore = () => {generating.current = false; setCreating(false); form.removeAttribute('aria-busy');};
      const submit = event => {
        if (isWord() && (!field('references').value.trim() || !words().length || !approval.current || request.current)) {
          event.preventDefault(); setMessage('Add references and words, then explicitly review the list before creating.');
          field('confirmWords')?.focus(); return;
        }
        if (generating.current) {event.preventDefault(); return;}
        generating.current = true; setCreating(true); form.setAttribute('aria-busy', 'true');
        // Native file downloads don't navigate. Retain the existing timed recovery.
        restoreTimer = window.setTimeout(restore, 12000);
      };
      window.addEventListener('pageshow', restore);
      const shuffle = () => setOffset(current => current + 1);
      form.addEventListener('input', edit); form.addEventListener('change', edit); form.addEventListener('submit', submit);
      field('shuffleTopics')?.addEventListener('click', shuffle);
      return () => {window.clearTimeout(restoreTimer); window.removeEventListener('pageshow', restore); form.removeEventListener('input', edit); form.removeEventListener('change', edit); form.removeEventListener('submit', submit); field('shuffleTopics')?.removeEventListener('click', shuffle); request.current?.abort();};
    }, []);
    useEffect(() => {
      field('wordCreateFields').style.display = wordMode ? 'block' : 'none';
      field('matchCreateFields').style.display = wordMode ? 'none' : 'block';
      field('gameTypeHelp').textContent = wordMode ? 'Build or enter a word list, review it, then create your printable.' : mode === 'match-meaning' ? 'Match the Meaning pairs references with kid-friendly meanings.' : 'Match the Verse uses the full verse text.';
      field('matchItemsSummary').textContent = mode === 'match-meaning' ? 'Add the meaning lines (optional)' : 'Use custom verse text (optional)';
      field('matchItemsLabel').textContent = mode === 'match-meaning' ? 'One per line: Reference | Meaning text' : 'One per line: Reference | Verse text | Version (optional)';
      field('topicHelp').textContent = wordMode ? 'Pick a topic to fill references and a word list.' : 'Pick a topic to fill references.';
      const enabled = !creating && (!wordMode || (!!refs && list.length > 0 && reviewed && !pending));
      field('createGameBtn').disabled = !enabled;
      field('createGameBtn').textContent = creating ? 'Creating…' : 'Create game';
      field('createGameBtn').setAttribute('aria-disabled', String(!enabled));
    }, [mode, refs, list, reviewed, pending, creating]);
    async function build() {
      if (!field('references').value.trim()) {setMessage('Add at least one reference first.'); field('references').focus(); return;}
      invalidate('Building a word list…');
      const token = revision.current;
      const controller = new AbortController(); request.current = controller; setPending(true);
      try {
        const response = await fetch('/games/words', {method:'POST', credentials:'same-origin', signal:controller.signal, headers:{'Content-Type':'application/json', 'X-CSRF-Token':form.querySelector('[name="csrf_token"]')?.value || document.querySelector('meta[name="csrf-token"]')?.content || ''}, body:JSON.stringify({refs:field('references').value.trim(),version:field('version').value,difficulty:field('difficulty').value})});
        if (!response.ok) throw new Error('Could not build words. Check your references or sign in again, then retry.');
        const data = await response.json();
        if (token !== revision.current) return;
        const result = Array.isArray(data.words) ? data.words.filter(word => typeof word === 'string' && word.trim()) : [];
        if (!result.length) {setMessage('No words found. Try another passage or enter your own list.'); return;}
        wordArea.value = result.join('\n'); setList(words());
        setMessage('Word list ready. Read it and check the review box before creating.');
      } catch (error) {
        if (token === revision.current && error.name !== 'AbortError') setMessage(error.message || 'Could not build a word list. Try again.');
      } finally {
        if (token === revision.current) {request.current = null; setPending(false);}
      }
    }
    function topic(item) {
      field('theme').value = item.label || '';
      field('references').value = normalize(item.refs);
      wordArea.value = Array.isArray(item.words) ? item.words.join('\n') : '';
      invalidate('Topic applied. Read the word list before approving it.');
    }
    const pool = (wordMode ? pools.word : pools.match);
    const picks = Array.from({length:Math.min(6,pool.length)}, (_, index) => pool[(offset + index) % pool.length]);
    return <>
      {createPortal(<>{picks.map((item,index) => <button key={`${item.label}-${index}`} type="button" className="pill ghost topic-pill" onClick={() => topic(item)}>{item.label}</button>)}</>, field('suggestedTopicList'))}
      <div className="game-word-actions"><button type="button" className="button ghost" disabled={pending} onClick={build}>{pending ? 'Building…' : 'Build word list'}</button><button type="button" className="button ghost" onClick={() => {wordArea.value=''; invalidate('List cleared. Build or enter a new list.');}}>Clear list</button></div>
      <p role="status" aria-live="polite">{message}</p>
      <p className="small muted">{list.length} words · Select a word to remove it.</p>
      <div className="word-chip-list">{list.map((word,index) => <button type="button" className="pill ghost" key={`${index}-${word}`} aria-label={`Remove ${word}`} onClick={() => {wordArea.value=list.filter((_,i)=>i!==index).join('\n'); invalidate('Word removed. Review the updated list.');}}>{word} <span aria-hidden="true">×</span></button>)}</div>
      <label className="word-review-check"><input id="confirmWords" name="confirmWords" type="checkbox" value="1" checked={reviewed} disabled={pending || !refs || !list.length} onChange={event => {approval.current=event.target.checked; setReviewed(event.target.checked); setMessage(event.target.checked ? 'Reviewed. Your game is ready to create.' : 'Review the list before creating.');}} />I reviewed the word list.</label>
    </>;
  }
  createRoot(mount).render(<GameBuilder />);
}
