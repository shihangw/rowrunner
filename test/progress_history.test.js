import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressSink} from '../src/progress_sink.js';
import {ProgressHistory} from '../examples/src/progress_history.ts';

test('HUD chart records cumulative source counts, not rate or animation frames', () => {
  const sink = new ProgressSink();
  const history = new ProgressHistory();
  const push = (completed, timestamp, extra = {}) =>
    history.add(
      sink.push({runId: 'chart', completed, timestamp, ...extra}, 100000),
    );
  assert.equal(history.plot().last, null);
  push(1000, 1000);
  push(2000, 3000);
  push(2000, 5000);
  assert.equal(history.points.length, 3);
  const chart = history.plot();
  assert.ok(chart.min > 0 && chart.min < 1000);
  assert.ok(chart.max > 2000);
  assert.equal(chart.duration, 4000);
  const plottedHeights = [...chart.line.matchAll(/[ML][\d.]+,([\d.]+)/g)].map(
    (match) => Number(match[1]),
  );
  assert.ok(plottedHeights[0] > plottedHeights[1]);
  assert.equal(plottedHeights[1], plottedHeights[2]);
  // Duplicate / out-of-order inputs cannot extend the chart or alter its endpoint.
  push(2000, 5000);
  push(900, 2000);
  assert.deepEqual(history.plot(), chart);
  assert.equal(history.points.length, 3);
  push(100, 6000);
  assert.equal(history.points.length, 1);
  assert.ok(history.plot().min < 100 && history.plot().max > 100);
  push(100, 7000, {status: 'completed'});
  push(500, 8000); // A terminal run rejects later updates.
  assert.equal(history.points.length, 2);
  push(50, 9000, {runId: 'next'});
  assert.equal(history.points.length, 1);
  assert.equal(history.plot().duration, 0);
});

test('HUD history bounds long runs while keeping the first and latest confirmed samples', () => {
  const history = new ProgressHistory();
  for (let i = 0; i < 10000; i++) {
    history.add({
      accepted: true,
      reason: 'update',
      sample: {timestamp: i * 1000, completed: i},
    });
  }
  assert.ok(history.points.length <= 2048);
  assert.equal(history.points[0].completed, 0);
  assert.equal(history.points.at(-1).completed, 9999);
  assert.ok(history.plot().min > 9800);
  assert.ok(history.plot().max > 9999);
  assert.equal(history.plot().duration, 60000);
  assert.ok(!/NaN|Infinity/.test(history.plot().line));
  history.reset();
  assert.equal(history.plot().line, '');
});

test('large cumulative totals use recent growth for readable bounds and headroom', () => {
  const history = new ProgressHistory();
  const initialCount = 552190000000;
  for (let index = 0; index < 3; index++) {
    history.add({
      accepted: true,
      reason: 'update',
      sample: {
        timestamp: index * 10000,
        completed: initialCount + index * 50000,
      },
    });
  }
  const chart = history.plot();
  assert.ok(chart.min > initialCount - 100000);
  assert.ok(chart.max >= initialCount + 150000); // One more poll's growth fits above the last point.
  assert.ok(chart.max - chart.min <= 250000);
  const firstHeight = Number(chart.line.match(/^M[\d.]+,([\d.]+)/)[1]);
  assert.ok(firstHeight - chart.last[1] > 20); // Visible rise instead of a flat line near the ceiling.
  assert.equal(history.points[0].completed, initialCount);
});

test('rolling window clips older segments without mutating confirmed samples', () => {
  const history = new ProgressHistory();
  for (const [timestamp, completed] of [
    [0, 1000],
    [30000, 4000],
    [70000, 8000],
  ]) {
    history.add({
      accepted: true,
      reason: 'update',
      sample: {timestamp, completed},
    });
  }
  const confirmedPoints = structuredClone(history.points);
  const chart = history.plot();
  assert.equal(chart.duration, 60000);
  assert.ok(chart.min > 0 && chart.min < 2000);
  const expectedBoundaryHeight =
    68 - ((2000 - chart.min) / (chart.max - chart.min)) * 64;
  assert.ok(
    chart.line.startsWith(`M2.00,${expectedBoundaryHeight.toFixed(2)}`),
  );
  assert.deepEqual(history.points, confirmedPoints);
});

test('single samples, flat counters and zero counters keep finite nondegenerate axes', () => {
  for (const completed of [0, 5, 552190000000]) {
    const history = new ProgressHistory();
    for (const timestamp of [0, 10000, 70000]) {
      history.add({
        accepted: true,
        reason: 'update',
        sample: {timestamp, completed},
      });
      const chart = history.plot();
      assert.ok(chart.max > chart.min);
      assert.ok(chart.min <= completed && chart.max >= completed);
      assert.ok(chart.last[1] >= 4 && chart.last[1] <= 68);
      assert.ok(!/NaN|Infinity/.test(chart.line));
      if (completed > 1000) {
        assert.ok(chart.min > 0);
      }
    }
  }
});
