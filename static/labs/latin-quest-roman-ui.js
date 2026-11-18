/* Latin Quest Roman-world interface.
 * Presentation and preset controls only. The existing game engine exclusively
 * owns question selection, grading, voice, progress, saved rounds and undo. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
function boot(){
  const root=$('lq-app');
  if(!root||!$('lq-start')||!$('lq-mode'))return;
  const setup=$('lq-setup'),session=$('lq-session'),result=$('lq-result');
  const status=$('lq-roman-nav-status');
  const progress=$('lq-progress-summary');
  const progressCopy=$('lq-roman-progress-copy');
  const turn=$('lq-round'),bar=$('lq-bar'),score=$('lq-score');
  const journalState=$('lq-roman-journal-state');
  const journalTurn=$('lq-roman-journal-turn');
  const journalScore=$('lq-roman-journal-score');
  const progressBar=$('lq-roman-mini-bar');
  const idle=$('lq-roman-idle');
  const setStatus=message=>{if(status)status.textContent=message;};
  function visible(element){return !!element&&!element.hidden;}
  function goTo(element){
    if(!element)return;
    element.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function setSelect(id,value){
    const field=$(id);
    if(!field||![...field.options].some(option=>option.value===value))return false;
    field.value=value;
    field.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  function sync(){
    const playing=visible(session);
    const done=visible(result);
    if(idle)idle.hidden=playing||done;
    if(progressCopy)progressCopy.textContent=(progress?.textContent||'').trim()||'Your cards and review history appear here after practice.';
    if(journalState)journalState.textContent=playing?'Quest in progress':done?'A round completed':'Ready for your quest';
    if(journalTurn)journalTurn.textContent=playing?(turn?.textContent||'A question is ready'):done?'See your results':'Choose a path to begin';
    if(journalScore)journalScore.textContent=done?(score?.textContent||'Round finished'):'';
    if(progressBar){
      const max=Math.max(1,Number(bar?.max)||1),value=playing?(Number(bar?.value)||0):done?max:0;
      progressBar.max=max;progressBar.value=Math.min(max,Math.max(0,value));
    }
    root.classList.toggle('lq-roman-playing',playing);
    root.classList.toggle('lq-roman-finished',done);
  }
  function launch(kind){
    if(!visible(setup)){setStatus('Finish or pause the current quest before changing your practice.');goTo(visible(session)?session:result);return;}
    if(kind==='flashcards'){
      setSelect('lq-mode','meaning');setSelect('lq-response','flash');
    }else if(kind==='quiz'){
      setSelect('lq-mode','meaning');setSelect('lq-response','choice');
    }else if(kind==='listening'){
      setSelect('lq-mode','meaning');setSelect('lq-response','recall');
      const auto=$('lq-auto');
      if(auto&&!auto.disabled)auto.checked=true;
    }else if(kind==='forms'){
      setSelect('lq-mode','nouns');setSelect('lq-response','choice');
      setSelect('lq-focus','all');
    }else if(kind==='grammar'){
      setSelect('lq-mode','grammar');setSelect('lq-response','choice');
    }else{return;}
    setStatus('');
    $('lq-start').click();sync();
  }
  root.querySelectorAll('[data-lq-preset]').forEach(button=>{
    button.addEventListener('click',()=>launch(button.dataset.lqPreset));
  });
  root.querySelectorAll('[data-lq-nav]').forEach(button=>{
    button.addEventListener('click',()=>{
      const action=button.dataset.lqNav;
      if(action==='home'){
        if(visible(session)){
          setStatus('Pause your quest first to return home. Your progress can be saved.');
          goTo(session);
        }else if(visible(result)){
          $('lq-again')?.click();setStatus('Welcome back, scholar!');goTo(setup);
        }else{goTo(setup);}
      }else if(action==='practice'){
        goTo(visible(session)?session:visible(result)?result:setup);
      }else if(action==='quiz'){
        launch('quiz');
      }else if(action==='progress'){
        goTo($('lq-roman-progress'));
      }else if(action==='reference'){
        if(visible($('lq-study'))){goTo($('lq-study'));}
        else{setStatus('The reference desk returns after you pause or complete this quest.');goTo(visible(session)?session:result);}
      }
      sync();
    });
  });
  // Reflect real engine state; never maintain a second grade or progress store.
  const observer=new MutationObserver(sync);
  for(const target of [setup,session,result,progress,turn,bar,score]){
    if(target)observer.observe(target,{attributes:true,attributeFilter:['hidden','value','max'],childList:true,characterData:true,subtree:target===progress||target===turn||target===score});
  }
  $('lq-player')?.addEventListener('change',()=>requestAnimationFrame(sync));
  root.addEventListener('click',event=>{
    if(event.target.closest('#lq-start,#lq-review,#lq-retest,#lq-again,#lq-next,#lq-stop,#lq-resume,#lq-quick-five,#lq-flash-known,#lq-flash-again')){
      requestAnimationFrame(sync);
    }
  });
  sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();