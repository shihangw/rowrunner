import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {
  ProgressSampleSchema,
  ProgressSnapshotSchema,
  PushResultSchema,
  SinkOptionsSchema,
  SceneOptionsSchema,
  WorldPluginSchema,
} from 'rowrunner/schemas';
import {ProgressSink} from 'rowrunner';
import {defineWorld, defineRunner} from 'rowrunner/plugins';
import {
  sceneCatalog,
  protagonistCatalog,
} from '../src/scene_configuration_catalog.js';

const timestamp = Date.parse('2026-09-24T12:00:00Z');
const sample = {runId: 'migration', completed: 500, timestamp};

test('public progress schemas normalize timestamps without inventing stateful defaults', () => {
  const parsed = ProgressSampleSchema.parse({
    ...sample,
    timestamp: '2026-09-24T14:00:00+02:00',
    extra: 'ignored',
  });
  assert.deepEqual(parsed, sample);
  assert.equal(Object.hasOwn(parsed, 'targetTotal'), false);
  assert.equal(Object.hasOwn(parsed, 'status'), false);
  assert.equal(
    ProgressSampleSchema.parse({...sample, targetTotal: null}).targetTotal,
    null,
  );
  assert.deepEqual(SinkOptionsSchema.parse({}), {
    windowMs: 20000,
    staleAfterMs: 30000,
    idleAfterMs: 10000,
    futureToleranceMs: 5000,
  });
  for (const invalid of [
    {completed: '500'},
    {completed: Number.MAX_SAFE_INTEGER + 1},
    {timestamp: '2026-09-24T12:00:00'},
    {timestamp: Infinity},
    {status: null},
    {label: null},
    {unit: ''},
    {targetTotal: NaN},
  ]) {
    assert.equal(
      ProgressSampleSchema.safeParse({...sample, ...invalid}).success,
      false,
    );
  }
});

test('sink retains state-dependent validation and exposes structured schema errors atomically', () => {
  const sink = new ProgressSink();
  assert.ok(ProgressSnapshotSchema.safeParse(sink.snapshot(timestamp)).success);
  const result = sink.push(
    {...sample, targetTotal: 2000, label: 'Migration'},
    timestamp,
  );
  assert.ok(PushResultSchema.safeParse(result).success);
  const before = sink.snapshot(timestamp);
  assert.throws(
    () => sink.push({...sample, completed: '600'}, timestamp),
    (error) => {
      assert.ok(error instanceof TypeError);
      assert.ok(error.cause instanceof z.ZodError);
      assert.deepEqual(error.cause.issues[0].path, ['completed']);
      return true;
    },
  );
  assert.deepEqual(sink.snapshot(timestamp), before);
  // Structural validity alone cannot decide whether a sample is too far in the future.
  const future = ProgressSampleSchema.parse({
    ...sample,
    timestamp: timestamp + 6000,
  });
  assert.throws(() => sink.push(future, timestamp), /future/);
  sink.push(
    {...sample, completed: 1000, timestamp: timestamp + 1000},
    timestamp + 1000,
  );
  const snapshot = sink.snapshot(timestamp + 1000);
  assert.equal(snapshot.targetTotal, 2000);
  assert.equal(snapshot.label, 'Migration');
  assert.equal(snapshot.rate, 500);
  assert.ok(ProgressSnapshotSchema.safeParse(snapshot).success);
});

test('definition schemas preserve callback identity, clone values and validate both registration paths', () => {
  let calls = 0;
  const draw = () => {
    calls++;
  };
  const accent = [0.2, 0.4, 0.6];
  const world = defineWorld({
    id: 'world',
    draw,
    palette: {accent},
    kind: undefined,
    apiVersion: undefined,
  });
  assert.equal(world.draw, draw);
  assert.equal(calls, 0);
  accent[0] = 1;
  assert.deepEqual(world.palette.accent, [0.2, 0.4, 0.6]);
  assert.ok(Object.isFrozen(world.palette.accent));
  assert.ok(WorldPluginSchema.safeParse(world).success);
  const runner = defineRunner({
    id: 'runner',
    draw,
    scale: 2,
    offset: [1, 2, 3],
  });
  const options = SceneOptionsSchema.parse({
    worlds: [world],
    runners: [runner],
  });
  assert.equal(options.worlds[0].kind, 'world');
  assert.equal(options.runners[0].draw, draw);
  for (const bad of [
    {scale: 0},
    {offset: [0, Infinity, 0]},
    {roll: -1},
    {forwardAxis: 'x'},
  ]) {
    assert.throws(() => defineRunner({id: 'bad', draw, ...bad}), TypeError);
    assert.throws(
      () => protagonistCatalog([{id: 'bad', draw, ...bad}]),
      TypeError,
    );
  }
  for (const bad of [
    {palette: {accent: [2, 0, 0]}},
    {path: {createFrame() {}, introDuration: -1}},
    {sky: {fragment: 2}},
  ]) {
    assert.throws(() => defineWorld({id: 'bad', draw, ...bad}), TypeError);
    assert.throws(() => sceneCatalog([{id: 'bad', draw, ...bad}]), TypeError);
  }
  assert.equal(
    SceneOptionsSchema.safeParse({camera: 'overhead'}).success,
    false,
  );
  // A malformed plugin must not silently fall back to an untagged definition.
  for (const bad of [
    {...world, kind: 'runner'},
    {...world, apiVersion: 2},
  ]) {
    assert.equal(SceneOptionsSchema.safeParse({worlds: [bad]}).success, false);
  }
});

test('explicit undefined overrides still inherit preset values', () => {
  const draw = () => {};
  const base = defineWorld({
    id: 'base',
    draw,
    road: false,
    palette: {accent: [0.1, 0.2, 0.3]},
  });
  const world = sceneCatalog(
    [
      {
        id: 'child',
        preset: 'base',
        road: undefined,
        palette: {accent: undefined},
      },
    ],
    [base],
  )[0];
  assert.equal(world.road, false);
  assert.deepEqual(world.palette.accent, [0.1, 0.2, 0.3]);
  const runner = defineRunner({id: 'base', draw, scale: 2, offset: [1, 3, 5]});
  const child = protagonistCatalog(
    [{id: 'child', preset: 'base', scale: undefined, offset: undefined}],
    [runner],
  )[0];
  assert.equal(child.scale, 2);
  assert.deepEqual(child.offset, [1, 3, 5]);
});
