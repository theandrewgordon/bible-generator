/* Audience acknowledgement is browser feedback, not a physical-display check. */
window.WorshipDisplayStatus = function (element, state) {
  if (!element) return;
  var ack = state.display_ack || {};
  var age = Number(state.server_epoch || Date.now() / 1000) - Number(ack.seen_epoch || 0);
  var matches = Number(ack.current_index) === Number(state.current_index) &&
    Number(ack.deck_revision || 0) === Number(state.deck_revision || 0) &&
    !!ack.blank === !!state.blank && !!ack.clear_words === !!state.clear_words;
  var label = 'Audience window not yet connected';
  var tone = 'waiting';
  if (ack.seen_epoch && age > 12) label = 'Audience window report is stale · check the display';
  else if (ack.seen_epoch && !ack.started) label = 'Audience window ready · select Start presenting there';
  else if (ack.seen_epoch && !matches) label = 'Waiting for audience window to receive this slide';
  else if (ack.seen_epoch) {
    label = 'Audience window received slide ' + (Number(ack.current_index) + 1);
    tone = 'confirmed';
  }
  element.textContent = label;
  element.dataset.status = tone;
};
