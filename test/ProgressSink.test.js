import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressSink, RateSmoother } from 'rowrunner';

const base = 1_800_000_000_000;
const push = (sink, ms, completed, extra = {}) =>
  sink.push({ runId: 'test', timestamp: base + ms, completed, ...extra }, base + ms);

test('starts unknown, derives a rate from cumulative counts, and never invents progress', () => {
  const sink = new ProgressSink();
  assert.equal(sink.snapshot(base).state, 'waiting');
  push(sink, 0, 1000, { targetTotal: 10000 });
  assert.equal(sink.snapshot(base).rate, null);
  push(sink, 2000, 2000);
  const s = sink.snapshot(base + 4000);
  assert.equal(s.rate, 500);
  assert.equal(s.completed, 2000);
  assert.equal(s.progress, 0.2);
  assert.equal(s.etaSeconds, 16);
});

test('time weights irregular sample intervals and clips to the trailing window', () => {
  const sink = new ProgressSink();
  push(sink, 0, 0);
  push(sink, 5000, 500);
  push(sink, 15000, 5500);
  push(sink, 30000, 8500);
  assert.equal(sink.snapshot(base + 30000).rate, 275);
});

test('duplicates, timestamp conflicts, and out-of-order samples never mutate freshness', () => {
  const sink = new ProgressSink();
  push(sink, 0, 0);
  push(sink, 2000, 1000);
  const initial = sink.snapshot(base + 2000);
  assert.equal(
    sink.push({ runId: 'test', timestamp: base + 2000, completed: 1000 }, base + 20000).reason,
    'duplicate',
  );
  assert.equal(push(sink, 2000, 2000).reason, 'timestamp-conflict');
  assert.equal(push(sink, 1000, 500).reason, 'out-of-order');
  assert.deepEqual(sink.snapshot(base + 2000), initial);
  assert.equal(sink.snapshot(base + 32000).state, 'stale');
});

test('old measurements received now are stale and produce no ETA or animation', () => {
  const sink = new ProgressSink();
  push(sink, 0, 0, { targetTotal: 10000 });
  sink.push({ runId: 'test', completed: 1000, timestamp: base + 2000 }, base + 100000);
  const s = sink.snapshot(base + 100000);
  assert.equal(s.state, 'stale');
  assert.equal(s.targetRate, 0);
  assert.equal(s.etaSeconds, null);
  assert.equal(s.rate, 500);
});

test('fresh zero increments stall; new work resumes; counters reset without negative rate', () => {
  const sink = new ProgressSink();
  push(sink, 0, 0);
  push(sink, 2000, 1000);
  push(sink, 12000, 1000);
  assert.equal(sink.snapshot(base + 12000).state, 'stalled');
  assert.equal(sink.snapshot(base + 12000).targetRate, 0);
  push(sink, 14000, 2000);
  assert.equal(sink.snapshot(base + 14000).state, 'running');
  assert.equal(push(sink, 16000, 10).reason, 'counter-reset');
  assert.equal(sink.snapshot(base + 16000).state, 'warming');
  assert.equal(sink.snapshot(base + 16000).resetCount, 1);
  push(sink, 18000, 1010);
  assert.equal(sink.snapshot(base + 18000).rate, 500);
});

test('pause and long gaps cannot generate a misleading resumed rate', () => {
  const sink = new ProgressSink();
  push(sink, 0, 0);
  push(sink, 2000, 1000, { status: 'paused' });
  assert.equal(sink.snapshot(base + 2000).targetRate, 0);
  push(sink, 10000, 1000);
  assert.equal(sink.snapshot(base + 10000).state, 'warming');
  push(sink, 12000, 2000);
  assert.equal(sink.snapshot(base + 12000).rate, 500);
  push(sink, 100000, 40000);
  assert.equal(sink.snapshot(base + 100000).rate, null);
});

test('unknown targets, target changes, empty jobs, and overshoot are well defined', () => {
  const sink = new ProgressSink();
  push(sink, 0, 100);
  push(sink, 2000, 200);
  assert.equal(sink.snapshot(base + 2000).progress, null);
  assert.equal(sink.snapshot(base + 2000).etaSeconds, null);
  push(sink, 4000, 300, { targetTotal: 1000 });
  push(sink, 6000, 400, { targetTotal: null });
  assert.equal(sink.snapshot(base + 6000).targetTotal, null);
  push(sink, 8000, 1200, { targetTotal: 1000 });
  assert.equal(sink.snapshot(base + 8000).progress, 1);
  assert.equal(sink.snapshot(base + 8000).completed, 1200);
  assert.equal(sink.snapshot(base + 8000).state, 'completed');
  assert.equal(push(sink, 9000, 1300).reason, 'terminal-run');
  const empty = new ProgressSink();
  push(empty, 0, 0, { targetTotal: 0 });
  assert.equal(empty.snapshot(base).progress, 1);
  assert.equal(empty.snapshot(base).etaSeconds, 0);
});

test('explicit completion and failure are terminal; new run clears old metadata', () => {
  for (const status of ['completed', 'failed']) {
    const sink = new ProgressSink();
    push(sink, 0, 10, { label: 'Old job', unit: 'files', targetTotal: 100 });
    push(sink, 2000, 20, { status });
    assert.equal(sink.snapshot(base + 50000).state, status);
    assert.equal(sink.snapshot(base + 50000).targetRate, 0);
    assert.equal(push(sink, 4000, 30).reason, 'terminal-run');
    sink.push({ runId: 'new', completed: 0, timestamp: base + 50000 }, base + 50000);
    const s = sink.snapshot(base + 50000);
    assert.equal(s.state, 'warming');
    assert.equal(s.targetTotal, null);
    assert.equal(s.unit, 'rows');
    assert.equal(s.label, 'new');
  }
});

test('invalid samples fail atomically and ISO timezone timestamps are normalized', () => {
  const sink = new ProgressSink();
  push(sink, 0, 100);
  const initial = sink.snapshot(base);
  for (const changes of [
    { completed: -1 },
    { completed: NaN },
    { completed: 1.5 },
    { completed: Number.MAX_SAFE_INTEGER + 1 },
    { timestamp: 'yesterday' },
    { timestamp: '2026-01-01T00:00:00' },
    { timestamp: null },
    { timestamp: Infinity },
    { timestamp: base + 6000 },
    { targetTotal: -1 },
    { status: 'oops' },
    { runId: '../x' },
    { unit: 3 },
    { label: {} },
  ]) {
    assert.throws(
      () => sink.push({ runId: 'test', completed: 200, timestamp: base + 1000, ...changes }, base),
      TypeError,
    );
    assert.deepEqual(sink.snapshot(base), initial);
  }
  const timestamp = new Date(base + 1000).toISOString();
  assert.equal(
    sink.push({ runId: 'test', completed: 200, timestamp }, base + 1000).sample.timestamp,
    base + 1000,
  );
  assert.throws(() => new ProgressSink({ windowMs: 0 }));
});

test('sample history is bounded under very frequent updates', () => {
  const sink = new ProgressSink();
  for (let i = 0; i < 5000; i++) push(sink, i, i);
  assert.ok(sink.samples.length <= 2048);
  assert.ok(Math.abs(sink.snapshot(base + 4999).rate - 1000) < 1e-9);
});

test('damping is frame-rate independent, monotonic, and settles to zero', () => {
  function at(fps) {
    const smoother = new RateSmoother();
    let previous = 0;
    for (let i = 0; i < fps * 3; i++) {
      const value = smoother.step(500, 1 / fps);
      assert.ok(value >= previous && value <= 500);
      previous = value;
    }
    return smoother;
  }
  const sixty = at(60),
    high = at(144);
  assert.ok(Math.abs(sixty.value - high.value) < 1e-9);
  for (let i = 0; i < 60 * 30; i++) sixty.step(0, 1 / 60);
  assert.equal(sixty.value, 0);
  assert.equal(sixty.step(NaN, 1), 0);
  assert.equal(sixty.step(100, -1), 0);
  high.reset();
  assert.equal(high.value, 0);
});
