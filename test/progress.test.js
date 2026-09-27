const { test } = require('node:test');
const assert = require('node:assert/strict');
const progress = require('../lib/progress.js');
const { createEta, formatEta } = progress;

const clock = () => {
  let at = 0;
  return { now: () => at, tick: ms => { at += ms; } };
};
const t = (key, ...args) => [key, ...args].join(':');

test('eta uses the fallback pace until two pages are measured', () => {
  const c = clock();
  const eta = createEta({ now: c.now, fallbackMs: 2000 });
  assert.deepEqual(eta.update(0, 10), { fraction: 0, remainingMs: 20000 });
  c.tick(5000);
  assert.deepEqual(eta.update(1, 10), { fraction: 0.1, remainingMs: 18000 });
});

test('eta switches to the measured pace', () => {
  const c = clock();
  const eta = createEta({ now: c.now, fallbackMs: 2000 });
  eta.update(0, 10);
  c.tick(6000);
  assert.deepEqual(eta.update(2, 10), { fraction: 0.2, remainingMs: 24000 });
});

test('eta clamps when more pages than expected are fetched', () => {
  const c = clock();
  const eta = createEta({ now: c.now });
  eta.update(0, 4);
  c.tick(9000);
  assert.deepEqual(eta.update(6, 4), { fraction: 1, remainingMs: 0 });
});

test('eta is unknown without a total', () => {
  assert.deepEqual(createEta().update(3, null), { fraction: null, remainingMs: null });
});

test('formatEta rounds up to whole minutes', () => {
  assert.equal(formatEta(null, t), '');
  assert.equal(formatEta(59000, t), 'eta_under1');
  assert.equal(formatEta(60000, t), 'eta_minutes:1');
  assert.equal(formatEta(61000, t), 'eta_minutes:2');
  assert.equal(formatEta(61 * 60000, t), 'eta_hours:1:1');
});

test('taskFor lager én oppgaverad per nøkkel, og removeTasks fjerner radene til én person', () => {
  const { parseHTML } = require('linkedom');
  const { document } = parseHTML('<div id="tasks"></div>');
  const box = document.getElementById('tasks');
  const a = progress.taskFor(box, 'anne|history');
  assert.equal(progress.taskFor(box, 'anne|history'), a);
  progress.taskFor(box, 'anne|countries', 'countries');
  progress.taskFor(box, 'bob|history');
  assert.equal(a.hidden, true);
  progress.showTask(a, { label: 'Henter', fraction: 0.5 });
  assert.equal(a.querySelector('.task-label').textContent, 'Henter');
  assert.equal(a.hidden, false);
  assert.equal(box.querySelector('[data-task="anne|countries"]').className, 'cmp-task countries');
  progress.removeTasks(box, 'anne');
  assert.deepEqual([...box.children].map(el => el.getAttribute('data-task')), ['bob|history']);
});
