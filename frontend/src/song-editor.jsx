import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import './song-editor.css';

function Preview({ text, config }) {
  const [result, setResult] = useState({slides: [], message: ''});
  const revision = useRef(0);
  useEffect(() => {
    const token = ++revision.current;
    const controller = new AbortController();
    setResult({slides: [], message: text.trim() ? 'Updating preview…' : ''});
    const timer = text.trim() ? setTimeout(async () => {
      try {
        const response = await fetch(config.previewUrl, {method:'POST', credentials:'same-origin', signal:controller.signal, headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf}, body:JSON.stringify({lines:text.trim()})});
        if (!response.ok) throw new Error('Preview unavailable. Your lyrics are preserved.');
        const data = await response.json();
        if (revision.current === token) setResult({slides:Array.isArray(data.slides) ? data.slides : [],message:''});
      } catch (error) {
        if (revision.current === token && error.name !== 'AbortError') setResult({slides:[],message:'Preview unavailable. Your lyrics are preserved; edit again to retry.'});
      }
    }, 350) : null;
    // Invalidate even an empty or removed section, including requests that ignore abort.
    return () => {revision.current++; clearTimeout(timer); controller.abort();};
  }, [text, config]);
  return <div className="wa-slide-preview"><p className="small muted" role="status">{result.message}</p>{result.slides.map((slide,index) => <div className="wa-slide-thumb" key={index}><div className="wa-slide-thumb-num">Slide {index+1}</div>{(slide.lines || []).join('\n')}</div>)}</div>;
}
const mount = document.getElementById('parts-list');
if (mount) {
  const config = JSON.parse(document.getElementById('song-editor-config').textContent);
  const song = config.song || {};
  const original = song.parts || {};
  const names = [...new Set([...(song.arrangement || []), ...Object.keys(original)])].filter(name => original[name]);
  const seed = names.length ? names.map((name,index) => ({id:index,name,text:original[name].map((line,i) => ((song.slide_breaks?.[name] || []).includes(i) ? '\n' : '') + line).join('\n')})) : [{id:0,name:'verse1',text:''},{id:1,name:'chorus',text:''}];
  const form = mount.closest('form');
  function Editor() {
    const [parts,setParts] = useState(seed);
    const [order,setOrder] = useState((song.arrangement || []).map(name => seed.find(part => part.name === name)?.id).filter(id => id !== undefined));
    const [error,setError] = useState('');
    const errorBox = useRef(null);
    useEffect(() => {if(error) errorBox.current?.focus();}, [error]);
    const nextId = useRef(seed.length);
    const drag = useRef(null);
    const latest = useRef({parts,order}); latest.current = {parts,order};
    const byId = id => parts.find(part => part.id === id);
    useEffect(() => {
      const add = () => setParts(current => [...current,{id:nextId.current++,name:'',text:''}]);
      const submit = event => {
        const {parts,order} = latest.current;
        const populated = parts.filter(part => part.text.trim());
        const keys = populated.map(part => part.name.trim().toLowerCase().replace(/[\s_-]/g,''));
        let message = !populated.length ? 'Add lyrics to at least one part.' : populated.some(part => !part.name.trim() || part.name.includes(',')) ? 'Give each part a name without commas.' : new Set(keys).size !== keys.length ? 'Give each part a unique name so lyrics are not overwritten.' : '';
        if (message) {event.preventDefault();setError(message);return;}
        document.getElementById('arrangement-input').value = order.map(id => parts.find(part => part.id === id)).filter(part => part?.name.trim() && part.text.trim()).map(part => part.name.trim()).join(',');
      };
      document.getElementById('add-part-btn').addEventListener('click',add);
      form.addEventListener('submit',submit);
      return () => {document.getElementById('add-part-btn').removeEventListener('click',add);form.removeEventListener('submit',submit);};
    }, []);
    useEffect(() => {document.getElementById('arrangement-input').value = order.map(id => byId(id)?.name.trim()).filter(Boolean).join(',');}, [parts,order]);
    function update(id,key,value) {setParts(current=>current.map(part=>part.id===id?{...part,[key]:value}:part));setError('');}
    function move(from,to) {if(to<0||to>=order.length||from===to)return;setOrder(current=>{const result=[...current];result.splice(to,0,result.splice(from,1)[0]);return result;});}
    return <>
      {error && <p className="song-editor-error" role="alert" tabIndex={-1} ref={errorBox}>{error}</p>}
      {parts.map((part,index)=><section className="wa-part-row" key={part.id} aria-label={`Part ${index+1}`}>
        <div className="wa-part-header"><label className="song-editor-name">Part name<input className="wa-input" name="part_name" value={part.name} placeholder="verse1, chorus, bridge" onChange={event=>update(part.id,'name',event.target.value)} /></label><button type="button" className="wa-remove-btn" aria-label={`Remove part ${index+1}`} onClick={()=>{setParts(current=>current.filter(item=>item.id!==part.id));setOrder(current=>current.filter(id=>id!==part.id));}}>Remove</button></div>
        <label>Lyrics for {part.name || `part ${index+1}`}<textarea name="part_lines" className="wa-input" rows="5" value={part.text} onChange={event=>update(part.id,'text',event.target.value)} placeholder="One lyric line per line. Blank line = new slide." /></label>
        <Preview text={part.text} config={config} />
      </section>)}
      {createPortal(<>{parts.filter(part=>part.name.trim()).map(part=><button key={part.id} type="button" className="wa-chip" onClick={()=>setOrder(current=>[...current,part.id])}>Add {part.name}</button>)}</>,document.getElementById('arrangement-chips'))}
      {createPortal(<>{!order.length && <span className="small muted">Add parts above to choose the order. A part can appear more than once.</span>}{order.map((id,index)=><span className="wa-order-tag" key={`${id}-${index}`} draggable onDragStart={event=>{drag.current=index;event.dataTransfer?.setData('text/plain',String(index));}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(drag.current!==null)move(drag.current,index);drag.current=null;}} onDragEnd={()=>{drag.current=null;}}>
        <span>{byId(id)?.name || 'Unnamed part'}</span><button type="button" disabled={index===0} aria-label={`Move arrangement item ${index+1} earlier`} onClick={()=>move(index,index-1)}>↑</button><button type="button" disabled={index===order.length-1} aria-label={`Move arrangement item ${index+1} later`} onClick={()=>move(index,index+1)}>↓</button><button type="button" aria-label={`Remove arrangement item ${index+1}`} onClick={()=>setOrder(current=>current.filter((_,i)=>i!==index))}>×</button>
      </span>)}</>,document.getElementById('arrangement-order'))}
    </>;
  }
  document.getElementById('arrangement-chips').replaceChildren();
  document.getElementById('arrangement-order').replaceChildren();
  createRoot(mount).render(<Editor />);
}
