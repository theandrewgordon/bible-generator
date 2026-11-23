(function(){
  'use strict';
  function attach(box){
    if(!window.SQSave||!box)return;
    if(box._sqSaveCleanup)box._sqSaveCleanup();
    const store=window.SQSave,message=document.createElement('p');message.id='save-feedback';message.setAttribute('role','status');
    const note=t=>{message.textContent=t;};
    function button(label,run){const b=document.createElement('button');b.className='nav';b.textContent=label;b.onclick=()=>Promise.resolve().then(run).catch(e=>note(/Error invoking remote method/.test(e.message)?'The backup could not be read or saved. Try another file or location.':e.message));box.appendChild(b);return b;}
    button('Save a backup',async()=>{
      const text=JSON.stringify(store.bundle(),null,2);
      if(window.SQDesktop){const saved=await SQDesktop.exportSave(text);note(saved?'Backup saved.':'Backup cancelled.');}
      else{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='scroll-quest-'+store.edition+'-backup.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);note('Backup downloaded. Keep it somewhere safe.');}
    });
    async function restore(text){
      const data=store.inspect(text),done=Object.values(data.levels).filter(r=>r.done).length;
      if(!window.confirm('Restore this backup with '+done+' completed episodes? Your current progress will be kept as the previous backup.'))return;
      store.restore(text);location.reload();
    }
    button('Restore a backup…',async()=>{
      if(window.SQDesktop){const text=await SQDesktop.importSave();if(text!==null)await restore(text);return;}
      const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.hidden=true;box.appendChild(picker);
      picker.oncancel=()=>picker.remove();picker.onchange=async()=>{try{if(picker.files[0])await restore(await picker.files[0].text());}catch(e){note(e.message);}finally{picker.remove();}};picker.click();
    });
    button('Recover the previous save',()=>{if(confirm('Return to the previous automatic backup? Your current progress will also be kept.')){store.recover();location.reload();}});
    if(window.SQDesktop){button('Toggle fullscreen',()=>SQDesktop.fullscreen());button('Quit game',()=>SQDesktop.quit());}
    box.appendChild(message);
    const show=()=>{const code=store.status.persistent?store.status.code:'unavailable';note(({recovered:'Progress recovered from an automatic backup.','desktop-recovered':'Progress recovered from the desktop backup.',damaged:'The save is damaged. Restore a backup before starting a new game.',unavailable:'Saving is unavailable. Export a backup before closing.','native-backup-failed':'The desktop backup could not be written. Export a backup.'})[code]||'Automatic backups protect your progress on this device.');};
    show();window.addEventListener('sq-save-status',show);box._sqSaveCleanup=()=>window.removeEventListener('sq-save-status',show);
  }
  window.SQSaveUI={attach};
})();
