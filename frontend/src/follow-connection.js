import {createLivePoll} from './live-poll.js';
export function createFollowConnection({sessionId,initial,fetcher,visible,publish,reload,later,cancel}){
  let revision=Number(initial.revision)||0;
  return createLivePoll({url:`/worship/live/state/${encodeURIComponent(sessionId)}`,fetcher,visible,later,cancel,
    onStatus:status=>publish(status==='ended'?{ended:true,status}:{status}),
    onData:data=>{
      if((Number(data.deck_revision)||0)>(Number(initial.deckRevision)||0)){publish({status:'reloading'});reload();return false;}
      if((Number(data.revision)||0)<revision)return;
      revision=Number(data.revision)||0;const current=Number(data.current_index);
      publish({current:Number.isFinite(current)?Math.max(0,Math.min(initial.slideCount-1,Math.floor(current))):0,blank:!!data.blank,clearWords:!!data.clear_words,loop:{seconds:Math.max(0,Number(data.loop_seconds)||0),started:Number(data.loop_started_epoch)||0,indices:(Array.isArray(data.loop_indices)?data.loop_indices:[]).map(Number).filter(index=>Number.isInteger(index)&&index>=0&&index<initial.slideCount),offset:data.server_epoch?Number(data.server_epoch)-Date.now()/1000:0}});
    },
  });
}
