/* Progress stays compatible with the original v1 save. Backups contain no account or network data. */
(function(root,factory){
  const lib=factory();if(typeof module==='object'&&module.exports)module.exports=lib;
  if(root&&root.document){
    let storage;try{storage=root.localStorage;}catch(e){storage=null;}
    root.SQSave=lib.createStore(storage,{demo:root.SQ_BUILD&&root.SQ_BUILD.edition==='demo',
      native:root.SQDesktop,onStatus:status=>root.dispatchEvent(new root.CustomEvent('sq-save-status',{detail:status}))});
  }
})(typeof window==='object'?window:null,function(){
  'use strict';
  const MAX=2*1024*1024,plain=o=>!!o&&Object.prototype.toString.call(o)==='[object Object]';
  function validate(value){
    if(!plain(value)||!plain(value.levels))throw new Error('This is not a Scroll Quest progress file.');
    if(value.last!==undefined&&typeof value.last!=='string')throw new Error('Invalid last episode.');
    const check=(v,depth=0)=>{
      if(depth>40)throw new Error('Save nesting is too deep.');
      if(v&&typeof v==='object')for(const k of Object.keys(v)){
        if(['__proto__','prototype','constructor'].includes(k))throw new Error('Unsupported save field.');check(v[k],depth+1);
      }else if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Invalid save number.');
    };check(value);
    for(const [id,r]of Object.entries(value.levels)){
      if(!/^[\w-]{1,80}$/.test(id)||!plain(r))throw new Error('Invalid episode record.');
      if(r.done!==undefined&&typeof r.done!=='boolean')throw new Error('Invalid completion record.');
      for(const key of ['stars','frags','leaves','servant','plays','time'])if(r[key]!==undefined&&(!Number.isFinite(r[key])||r[key]<0))throw new Error('Invalid episode number.');
    }
    const text=JSON.stringify(value);if(text.length>MAX)throw new Error('Save file is too large.');return JSON.parse(text);
  }
  function parse(raw){if(typeof raw!=='string'||raw.length>MAX)throw new Error('Invalid save file.');return validate(JSON.parse(raw));}
  function createStore(storage,options={}){
    const key=options.demo?'scrollquest.demo.progress.v1':'scrollquest.progress.v1',edition=options.demo?'demo':'full';
    let memory=null,status={code:'ok',persistent:true},started=false;
    const announce=(code,persistent=true)=>{status={code,persistent};if(options.onStatus)options.onStatus(status);};
    const get=k=>{try{return storage?storage.getItem(k):null;}catch(e){return null;}};
    const set=(k,v)=>{if(!storage)throw new Error('Storage is unavailable.');storage.setItem(k,v);};
    const valid=raw=>{try{return parse(raw);}catch(e){return null;}};
    function mirror(value){
      try{if(options.native&&options.native.backupProgress)Promise.resolve(options.native.backupProgress(value)).catch(()=>announce('native-backup-failed'));}catch(e){announce('native-backup-failed');}
    }
    function write(value){
      const next=validate(value),raw=JSON.stringify(next),previous=get(key);
      memory=raw;
      try{
        if(previous&&!valid(previous))set(key+'.corrupt',previous.slice(0,MAX));
        if(previous&&previous!==raw&&valid(previous)){
          const backup=get(key+'.backup.1');if(backup&&valid(backup))set(key+'.backup.2',backup);
          set(key+'.backup.1',previous);
        }
        set(key,raw);if(status.code==='unavailable')announce('ok');mirror(next);return true;
      }catch(e){announce('unavailable',false);mirror(next);return false;}
    }
    function read(){
      if(memory&&!status.persistent)return parse(memory);
      const raw=get(key),current=valid(raw);
      if(current){memory=JSON.stringify(current);return current;}
      if(!started){
        started=true;const native=options.native&&options.native.initialProgress;
        try{if(native){const saved=validate(native);if(raw)try{set(key+'.corrupt',raw.slice(0,MAX));}catch(e){}write(saved);announce('desktop-recovered',status.persistent);return saved;}}catch(e){}
      }
      for(const suffix of ['.backup.1','.backup.2']){
        const backup=valid(get(key+suffix));if(!backup)continue;
        try{if(raw)set(key+'.corrupt',raw.slice(0,MAX));set(key,JSON.stringify(backup));}catch(e){announce('unavailable',false);}
        memory=JSON.stringify(backup);announce('recovered',status.persistent);mirror(backup);return backup;
      }
      if(raw){if(status.code!=='damaged'){try{set(key+'.corrupt',raw.slice(0,MAX));}catch(e){}announce('damaged');}return {levels:{},w8:1};}
      return {levels:{}};
    }
    function bundle(){return {format:'scroll-quest-save',version:1,edition,progress:read()};}
    function inspect(text){
      if(typeof text!=='string'||text.length>MAX)throw new Error('Save file is too large.');
      let input;try{input=JSON.parse(text);}catch(e){throw new Error('That file could not be read. Choose a Scroll Quest backup.');}
      if(!plain(input))throw new Error('Choose a Scroll Quest backup file.');
      if(input&&input.format===undefined&&edition==='full')return validate(input);
      if(input.format!=='scroll-quest-save'||input.version!==1||input.edition!==edition)throw new Error('Choose a '+edition+' edition Scroll Quest backup.');
      return validate(input.progress);
    }
    function restore(text){const progress=inspect(text);if(!write(progress))throw new Error('Storage is unavailable. Your imported progress can be exported again, but is not saved in this browser.');return progress;}
    function recover(){const backup=valid(get(key+'.backup.1'))||valid(get(key+'.backup.2'))||valid(get(key+'.reset-backup'));if(!backup)throw new Error('No previous backup is available.');const stored=write(backup);announce('recovered',stored);if(!stored)throw new Error('Previous progress is available for export, but storage is unavailable.');return backup;}
    function clear(){
      // A deliberate reset retains a separate recovery copy, but never resurrects it automatically.
      const prior=read();try{set(key+'.reset-backup',JSON.stringify(prior));for(const s of ['', '.backup.1','.backup.2','.corrupt'])storage.removeItem(key+s);}catch(e){announce('unavailable',false);}
      memory=JSON.stringify({levels:{},w8:1});write({levels:{},w8:1});
    }
    return {key,edition,read,write,bundle,inspect,restore,recover,clear,get status(){return status;}};
  }
  return {createStore,validate,parse};
});
