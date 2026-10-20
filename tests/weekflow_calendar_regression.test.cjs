const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function extract(file, names, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const functions = names.map(name => {
    const match = source.match(new RegExp(`  function ${name}\\([\\s\\S]*?\\n  }`));
    assert.ok(match, `Missing ${name}`);
    return match[0];
  }).join('\n');
  const context = vm.createContext(globals);
  vm.runInContext(functions, context);
  return context;
}
const calendar = extract('static/weekflow_schedule.js', ['calendarDate', 'calendarMinute', 'calendarOnDate', 'calendarWindow'], { state: { family: { timezone: 'America/New_York' } } });
test('all-day spans include intermediate days and exclude the end date', () => {
  const event = {all_day:true,start:'2026-10-20',end:'2026-10-23'};
  for (const date of ['2026-10-20','2026-10-21','2026-10-22']) assert.equal(calendar.calendarOnDate(event,date), true);
  for (const date of ['2026-10-19','2026-10-23']) assert.equal(calendar.calendarOnDate(event,date), false);
});
test('overnight windows cover midnight without false overlaps on the end day', () => {
  const event = {start:'2026-10-20T23:00:00-04:00',end:'2026-10-21T02:00:00-04:00'};
  assert.equal(calendar.calendarOnDate(event,'2026-10-21'),true);
  assert.equal(calendar.calendarWindow(event,'2026-10-20').end,1440);
  assert.equal(calendar.calendarWindow(event,'2026-10-21').start,0);
  assert.equal(calendar.calendarWindow(event,'2026-10-21').end,120);
  event.end='2026-10-21T00:00:00-04:00';
  assert.equal(calendar.calendarOnDate(event,'2026-10-21'),false);
});
test('logistics displays the family timezone when the browser timezone differs', () => {
  process.env.TZ='America/Los_Angeles';
  const helper = extract('static/weekflow_logistics.js', ['formatCalendarTime'], {config:{timezone:'America/New_York'}});
  assert.match(helper.formatCalendarTime('2026-10-20T09:00:00-04:00'), /9:00/);
});
