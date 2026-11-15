export function createFollowConnection({ sessionId, initial, fetcher, visible, publish, reload, later = setTimeout, cancel = clearTimeout }) {
  let stopped=false, active=false, controller=null, timer=null, generation=0, resumeQueued=false, failures=0;
  let revision=Number(initial.revision)||0;
  const clear=()=>{cancel(timer);timer=null;};
  const schedule=delay=>{clear();if(!stopped&&visible())timer=later(()=>{void refresh();},delay);};
  async function refresh(){
    clear();
    if(stopped||!visible())return;
    if(active){resumeQueued=true;return;}
    active=true;resumeQueued=false;
    const token=generation;controller=new AbortController();
    const timeout=later(()=>controller?.abort(),12000);
    try{
      const response=await fetcher(`/worship/live/state/${encodeURIComponent(sessionId)}`,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      if(stopped||token!==generation||!visible())return;
      if(response.status===410){stopped=true;publish({ended:true,status:'ended'});return;}
      if(!response.ok)throw new Error('offline');
      const data=await response.json();
      if(stopped||token!==generation||!visible())return;
      if(!data.ok)throw new Error('offline');
      if((Number(data.deck_revision)||0)>(Number(initial.deckRevision)||0)){stopped=true;publish({status:'reloading'});reload();return;}
      if((Number(data.revision)||0)>=revision){
        revision=Number(data.revision)||0;
        const current=Number(data.current_index);
        publish({current:Number.isFinite(current)?Math.max(0,Math.min(initial.slideCount-1,Math.floor(current))):0,blank:!!data.blank,clearWords:!!data.clear_words,loop:{seconds:Math.max(0,Number(data.loop_seconds)||0),started:Number(data.loop_started_epoch)||0,indices:(Array.isArray(data.loop_indices)?data.loop_indices:[]).map(Number).filter(index=>Number.isInteger(index)&&index>=0&&index<initial.slideCount),offset:data.server_epoch?Number(data.server_epoch)-Date.now()/1000:0}});
      }
      failures=0;publish({status:'following'});
    }catch(error){if(!stopped&&token===generation&&visible()){failures++;publish({status:'reconnecting'});}}
    finally{cancel(timeout);active=false;controller=null;if(!stopped&&visible())schedule(resumeQueued?0:Math.min(10000,1500*Math.max(1,failures)));}
  }
  return {
    refresh,
    pause(){clear();generation++;controller?.abort();resumeQueued=false;},
    resume(){if(stopped)return;resumeQueued=true;void refresh();},
    stop(){stopped=true;clear();generation++;controller?.abort();},
  };
}
