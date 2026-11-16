// Shared transport; consumers retain their own revisions, commands, and display rules.
export function createLivePoll({url,fetcher,visible,onData,onStatus,interval=1500,later=setTimeout,cancel=clearTimeout}){
  let stopped=false,active=false,controller=null,timer=null,generation=0,queued=false,failures=0;
  const clear=()=>{cancel(timer);timer=null;};
  const schedule=delay=>{clear();if(!stopped&&visible())timer=later(()=>{void refresh();},delay);};
  async function refresh(){
    clear();if(stopped||!visible())return;if(active){queued=true;return;}
    active=true;queued=false;const token=generation;controller=new AbortController();const timeout=later(()=>controller?.abort(),12000);
    try{
      const response=await fetcher(url,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      if(stopped||token!==generation||!visible())return;
      if(response.status===410){stopped=true;onStatus('ended');return;}
      if(!response.ok)throw new Error('offline');
      const data=await response.json();if(stopped||token!==generation||!visible())return;
      if(!data.ok)throw new Error('offline');
      if(onData(data)===false){stopped=true;return;}
      failures=0;onStatus('following');
    }catch{if(!stopped&&token===generation&&visible()){failures++;onStatus('reconnecting');}}
    finally{cancel(timeout);active=false;controller=null;if(!stopped&&visible())schedule(queued?0:Math.min(10000,interval*Math.max(1,failures)));}
  }
  return {refresh,pause(){clear();generation++;controller?.abort();queued=false;},resume(){if(stopped)return;queued=true;void refresh();},stop(){stopped=true;clear();generation++;controller?.abort();}};
}
