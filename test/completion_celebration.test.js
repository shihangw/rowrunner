import test from 'node:test';
import assert from 'node:assert/strict';
import {CompletionCelebration} from './fixtures/example_content_fixtures.js';
import {ProgressSink} from '@shihangw/rowrunner';

function effect() {
  // State/lifecycle checks independent of a browser or a GPU.
  return Object.assign(Object.create(CompletionCelebration.prototype), {
    seen: new Set(),
    activeKey: null,
    startedAt: null,
    particles: [],
    completionMessage: 'Congrats!',
    motion: {matches: false},
    element: {hidden: true},
    canvas: {},
    message: {style: {}},
    title: {},
    detail: {},
    context: null,
  });
}
const done = {
  runId: 'migration',
  state: 'completed',
  completed: 1200,
  unit: 'rows',
};

test('confetti loops with a bounded pool until reset, without restarting on repeated snapshots', () => {
  const c = effect();
  c.update(done, {now: 1000});
  assert.equal(c.element.hidden, false);
  assert.equal(c.title.textContent, 'Congrats!');
  assert.equal(c.detail.textContent, '1,200 rows completed');
  assert.ok(c.particles.some((p) => p.side === -1));
  assert.ok(c.particles.some((p) => p.side === 1));
  const pool = c.particles;
  assert.equal(pool.length, 280);
  c.update(done, {now: 2000});
  assert.equal(c.startedAt, 1000);
  c.update(done, {now: 6500});
  assert.equal(c.element.hidden, false);
  assert.equal(c.canvas.hidden, false);
  assert.equal(c.message.style.opacity, '1');
  assert.equal(c.particles, pool);
  c.update(done, {now: 60000});
  assert.equal(c.element.hidden, false);
  assert.equal(c.title.textContent, 'Congrats!');
  assert.equal(c.startedAt, 1000);
  assert.equal(c.particles, pool);
  c.update(done, {now: 86400000});
  assert.equal(c.particles, pool);
  assert.equal(c.canvas.hidden, false);
  c.reset();
  c.update(done, {now: 8000});
  assert.equal(c.element.hidden, true);
  c.update({...done, runId: 'next'}, {now: 9000});
  assert.equal(c.element.hidden, false);
  c.update({...done, runId: 'next', state: 'running'}, {now: 9500});
  assert.equal(c.element.hidden, true);
  assert.equal(c.particles.length, 0);
  c.reset();
  c.update(done, {now: 10000, source: 'another-source'});
  assert.equal(c.element.hidden, false);
});

test('only completed snapshots celebrate; target completion and explicit completion both work', () => {
  const c = effect();
  for (const state of [
    'waiting',
    'warming',
    'running',
    'paused',
    'stalled',
    'stale',
    'failed',
  ]) {
    c.update({...done, state}, {now: 0});
    assert.equal(c.element.hidden, true, state);
  }
  const sink = new ProgressSink();
  sink.push(
    {runId: 'target', completed: 100, targetTotal: 100, timestamp: 1000},
    1000,
  );
  c.update(sink.snapshot(1000), {now: 0});
  assert.equal(c.element.hidden, false);
  c.update({state: 'waiting'}, {now: 10});
  assert.equal(c.element.hidden, true);
  sink.push(
    {runId: 'open-ended', completed: 50, status: 'completed', timestamp: 2000},
    2000,
  );
  c.update(sink.snapshot(2000), {now: 100});
  assert.equal(c.element.hidden, false);
});

test('reduced motion shows a static message and cannot restart discarded confetti', () => {
  for (const os of [false, true]) {
    const c = effect();
    c.motion.matches = os;
    c.completionMessage = 'Migration complete!';
    c.update(done, {now: 0, reduced: !os});
    assert.equal(c.canvas.hidden, true);
    assert.equal(c.element.hidden, false);
    assert.equal(c.title.textContent, 'Migration complete!');
    assert.equal(c.message.style.opacity, '1');
    assert.equal(c.particles.length, 0);
    c.motion.matches = false;
    c.update(done, {now: 100});
    assert.equal(c.particles.length, 0);
    c.update(done, {now: 10000});
    assert.equal(c.element.hidden, false);
    assert.equal(c.message.style.opacity, '1');
    c.update({...done, runId: 'next', state: 'running'}, {now: 11000});
    assert.equal(c.element.hidden, true);
  }
});
