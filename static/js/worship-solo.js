/* One visible screen: no stage previews or private operator information. */
window.WorshipSoloPresenter = function (options) {
  'use strict';
  var surface = document.getElementById('solo-gestures');
  var menu = document.getElementById('solo-menu');
  var close = document.getElementById('solo-close');
  var awake = document.getElementById('solo-awake');
  var ending = false, started = false, wakeLock = null, awakeWanted = false;
  var pointer = null, suppressClickUntil = 0, previouslyFocused = null;

  function update() {
    var state = options.getState();
    document.getElementById('solo-position').textContent = 'Slide ' + (state.index + 1) + ' of ' + state.count + ' · ' + (state.blank ? 'BLACK SCREEN' : state.clear ? 'WORDS CLEARED' : 'LIVE');
    document.getElementById('solo-blank').textContent = state.blank ? 'Show screen' : 'Black screen';
    document.getElementById('solo-clear').textContent = state.clear ? 'Show words' : 'Clear words';
    document.getElementById('solo-video').hidden = !state.video;
    surface.hidden = !started || !menu.hidden || state.ended || state.video;
    document.getElementById('solo-video-controls').hidden = !started || !menu.hidden || state.ended || !state.video;
    document.querySelectorAll('[data-solo-action], [data-solo-gesture]').forEach(function (button) {
      var action = button.dataset.soloAction || button.dataset.soloGesture;
      button.disabled = state.ended || (action === 'previous' && state.index === 0) || (action === 'next' && state.index === state.count - 1);
    });
  }
  function showMenu() {
    if (!started || options.getState().ended) return;
    previouslyFocused = document.activeElement;
    menu.hidden = false;
    surface.hidden = true;
    update();
    close.focus();
  }
  function hideMenu() {
    menu.hidden = true;
    update();
    if (!surface.hidden) {
      var target = previouslyFocused && surface.contains(previouslyFocused) && !previouslyFocused.disabled ? previouslyFocused : surface.querySelector('[data-solo-gesture="menu"]');
      target.focus({preventScroll: true});
    }
  }
  function act(action) {
    if (!started || options.getState().ended) return;
    if (action === 'menu') showMenu();
    else options.send(action);
    update();
  }
  surface.addEventListener('pointerdown', function (event) {
    if (event.isPrimary === false) return;
    pointer = {x: event.clientX, y: event.clientY, id: event.pointerId};
  });
  surface.addEventListener('pointercancel', function () { pointer = null; });
  surface.addEventListener('pointerup', function (event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    var dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer = null;
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      suppressClickUntil = Date.now() + 450;
      act(dx < 0 ? 'next' : 'previous');
    } else if (Math.abs(dx) + Math.abs(dy) > 20) suppressClickUntil = Date.now() + 450;
  });
  surface.addEventListener('click', function (event) {
    if (Date.now() < suppressClickUntil) return;
    var button = event.target.closest('[data-solo-gesture]');
    if (button && !button.disabled) act(button.dataset.soloGesture);
  });
  document.querySelectorAll('[data-solo-action]').forEach(function (button) {
    button.addEventListener('click', function () { act(button.dataset.soloAction); });
  });
  close.addEventListener('click', hideMenu);
  document.getElementById('solo-video-controls').addEventListener('click', showMenu);
  menu.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !options.getState().ended) { event.preventDefault(); event.stopPropagation(); hideMenu(); }
    if (event.key === 'Tab') {
      var buttons = Array.from(menu.querySelectorAll('button:not(:disabled)')).filter(function (button) { return button.getClientRects().length; });
      var first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    // Keyboard commands must not change the slide behind this modal.
    event.stopPropagation();
  });
  document.getElementById('solo-fullscreen').addEventListener('click', options.fullscreen);
  function requestAwake() {
    if (wakeLock || !awakeWanted || !navigator.wakeLock || document.visibilityState === 'hidden') return;
    navigator.wakeLock.request('screen').then(function (lock) {
      if (options.getState().ended || !awakeWanted) { lock.release().catch(function () {}); return; }
      wakeLock = lock;
      awake.textContent = 'Screen stays awake';
      lock.addEventListener('release', function () { wakeLock = null; awake.textContent = 'Keep screen awake'; });
    }).catch(function () { awake.textContent = 'Keep phone unlocked'; });
  }
  awake.addEventListener('click', function () {
    awakeWanted = true;
    if (!navigator.wakeLock) awake.textContent = 'Keep phone unlocked';
    requestAwake();
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') requestAwake(); });
  document.getElementById('solo-end').addEventListener('click', function () {
    if (ending || !window.confirm('End this Live Worship session for everyone?')) return;
    ending = true;
    fetch('/worship/live/control/' + encodeURIComponent(options.sessionId), {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-Worship-Live': '1'},
      credentials: 'same-origin', body: JSON.stringify({action: 'end'})
    }).then(function (response) { return response.json(); }).then(function (data) {
      if (!data.ok) throw new Error('end');
      options.onEnd();
    }).catch(function () { ending = false; document.getElementById('solo-connection').textContent = 'Could not end the session. Try again.'; });
  });
  return {
    start: function () { started = true; surface.hidden = false; awakeWanted = true; requestAwake(); update(); },
    update: update,
    setConnection: function (ok) { document.getElementById('solo-connection').textContent = ok ? 'Session connected' : 'Session reconnecting · loaded slides still work on this phone'; },
    end: function () {
      surface.hidden = true; menu.hidden = false; awakeWanted = false;
      document.getElementById('solo-video-controls').hidden = true;
      if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
      document.getElementById('solo-heading').textContent = 'Session ended';
      document.getElementById('solo-connection').textContent = 'This presentation has ended.';
      menu.querySelectorAll('button').forEach(function (button) { button.disabled = true; });
    }
  };
};
