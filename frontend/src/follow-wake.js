export function createWakeKeeper({request,visible,publish}){
  let wanted=false,lock=null,pending=false,generation=0,disposed=false;
  const emit=message=>publish({wanted,active:!!lock,pending,message:message||''});
  const release=value=>{try{Promise.resolve(value?.release()).catch(()=>{});}catch{}};
  async function acquire(){
    if(disposed||!wanted||!visible()||lock||pending)return;
    pending=true;const token=generation;emit();
    try{
      const next=await request();
      if(disposed||token!==generation||!wanted||!visible()){release(next);return;}
      lock=next;next.addEventListener('release',()=>{if(lock===next){lock=null;emit();}});
    }catch{if(token===generation){wanted=false;emit('Screen-on mode was unavailable. You can try again.');}}
    finally{pending=false;emit();if(!disposed&&wanted&&visible()&&!lock&&token!==generation)void acquire();}
  }
  return {
    setWanted(value){wanted=value;generation++;if(!wanted){release(lock);lock=null;}emit();if(wanted)void acquire();},
    pause(){generation++;release(lock);lock=null;emit();},
    resume(){void acquire();},
    stop(){disposed=true;wanted=false;generation++;release(lock);lock=null;},
  };
}
