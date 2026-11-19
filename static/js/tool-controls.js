/* Shared normal-site preferences and task handoff. No API tokens or learner profiles. */
(function(){
  const storage={get:key=>{try{return localStorage.getItem(key);}catch{return null;}},set:(key,value)=>{try{localStorage.setItem(key,value);return true;}catch{return false;}}};
  function taskUrl(){
    const url=new URL(location.href),worksheet=document.getElementById('worksheetForm'),pack=document.getElementById('lesson-pack-form');
    if(worksheet){
      const value=name=>worksheet.elements.namedItem(name)?.value||'';
      const pending=document.querySelector('.tagify__input')?.textContent?.trim()||'';
      let verse=value('verse');try{const data=JSON.parse(verse);if(Array.isArray(data))verse=data.map(tag=>tag.value).join(', ');}catch{}
      const fields={v:[verse,pending].filter(Boolean).join(', '),version:value('version'),title:value('custom_title'),text:value('custom_text'),prompt:value('custom_prompt'),learner_level:value('learner_level'),cursive:worksheet.elements.namedItem('cursive')?.checked?'1':'0'};
      Object.entries(fields).forEach(([key,value])=>{if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);});
    }else if(pack){
      const mapping={verse:'verse',version:'version',age_bracket:'age',lesson_mode:'mode',session_minutes:'minutes',use_cursive:'cursive',include_coloring:'coloring'};
      Object.entries(mapping).forEach(([name,key])=>{const input=pack.elements.namedItem(name);if(input)url.searchParams.set(key,input.type==='checkbox'?(input.checked?'1':'0'):input.value);});
    }
    return url.pathname+url.search+url.hash;
  }
  window.FaithSparksTools={storage,taskUrl};
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[data-preserve-task]');
    if(link){const destination=new URL(link.href,location.origin);destination.searchParams.set('next',taskUrl());link.href=destination.href;}
    if(!event.target.closest('.profile-drop'))document.querySelectorAll('.profile-drop[open]').forEach(menu=>{menu.open=false;});
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.profile-drop[open]').forEach(menu=>{menu.open=false;(menu.closest('#mainNav')&&!document.body.classList.contains('nav-open')?document.getElementById('menuToggle'):menu.querySelector('summary'))?.focus();});});
  document.addEventListener('DOMContentLoaded',()=>{
    const form=document.getElementById('tool-preferences');
    if(form){
      const defaults={preferredVersion:'web',lessonPackMode:'family',lessonPackAge:'6-8',learnerLevel:'growing'};
      [...form.elements].forEach(input=>{
        if(!input.name)return;const value=storage.get(input.name)??defaults[input.name];
        if(input.type==='checkbox')input.checked=value==='true';else if([...input.options||[]].some(option=>option.value===value))input.value=value;
      });
      form.addEventListener('submit',event=>{
        event.preventDefault();let saved=true;
        [...form.elements].filter(input=>input.name).forEach(input=>{saved=storage.set(input.name,input.type==='checkbox'?String(input.checked):input.value)&&saved;});
        storage.set('lessonPackCursive',form.elements.namedItem('useCursive').checked?'1':'0');
        document.getElementById('preferences-status').textContent=saved?'Preferences saved for this browser.':'Browser storage is unavailable. You can still choose preferences inside each tool.';
      });
    }
    const resumable=['/generate','/lesson-pack','/worship','/family-game-night/setup'];
    const owner=document.querySelector('meta[name="task-owner"]')?.content||'guest';
    const key='faithsparks:last-task:'+owner;
    if(resumable.includes(location.pathname)){try{sessionStorage.setItem(key,JSON.stringify({path:location.pathname,title:document.querySelector('h1')?.textContent?.trim()||'your last tool'}));}catch{}}
    const root=document.getElementById('continue-last-tool');
    if(root){try{const last=JSON.parse(sessionStorage.getItem(key)||'null');if(last&&resumable.includes(last.path)){const link=document.createElement('a');link.className='button ghost';link.href=last.path;link.textContent='Return to '+last.title;root.appendChild(link);}}catch{}}
  });
})();
