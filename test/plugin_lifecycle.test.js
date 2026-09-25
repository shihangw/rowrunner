import test from 'node:test';
import assert from 'node:assert/strict';
import {defineWorld, defineRunner} from '@shihangw/rowrunner/plugins';
import {bookie} from '../examples/src/runners/bookie/bookie_runner.ts';
import {ionGlacier as glacier} from '../examples/src/worlds/ion-glacier/ion_glacier_world.ts';
import {createPluginRegistry} from '../src/plugins/plugin_registry.js';
import {PluginInstanceHost} from '../src/plugins/plugin_instance_host.js';
import {
  sceneCatalog,
  protagonistCatalog,
} from './fixtures/example_content_fixtures.js';
import {RoadScene} from '../src/road_scene.js';

test('plugin catalogs inherit presets and remain isolated from input and other instances', () => {
  const accent = [0.3, 0.5, 0.9];
  const offset = [0, 4, -1];
  const world = defineWorld({id: 'blue', preset: 'glacier', palette: {accent}});
  const runner = defineRunner({
    id: 'little',
    preset: 'bookie',
    scale: 0.5,
    offset,
  });
  const registry = createPluginRegistry([glacier, bookie, world, runner]);
  accent[0] = 1;
  offset[1] = 20;
  const worlds = sceneCatalog(['blue'], registry.worlds);
  const runners = protagonistCatalog(['little'], registry.runners);
  assert.deepEqual(worlds[0].palette.accent, [0.3, 0.5, 0.9]);
  assert.equal(createPluginRegistry().worlds.length, 0);
  assert.equal(createPluginRegistry().runners.length, 0);
  assert.deepEqual(runners[0].offset, [0, 4, -1]);
  assert.equal(runners[0].forwardAxis, '-z');
  assert.equal(runners[0].draw, bookie.draw);
  assert.deepEqual(worlds[0].sky, glacier.sky);
  assert.equal(
    createPluginRegistry().worlds.some((p) => p.id === 'blue'),
    false,
  );
  assert.ok(Object.isFrozen(world.palette.accent));
  assert.ok(Object.isFrozen(registry.worlds.at(-1).palette));
});

test('invalid registrations fail before WebGL initialization', () => {
  const plugin = defineWorld({id: 'custom', draw() {}});
  for (const plugins of [
    [plugin, plugin],
    [glacier, defineWorld({id: 'glacier', draw() {}})],
    [{...plugin, apiVersion: 2}],
    [{...plugin, kind: 'bad'}],
    [{...plugin, preset: 'missing'}],
  ]) {
    assert.throws(
      () => new RoadScene(null, {plugins}),
      /Duplicate|version|declare|preset/,
    );
  }
  for (const palette of [
    {unknown: [0, 0, 0]},
    {accent: [2, 0, 0]},
    {accent: Array(3)},
    [],
  ]) {
    assert.throws(
      () => defineWorld({id: 'bad', draw() {}, palette}),
      TypeError,
    );
  }
  assert.throws(
    () => defineRunner({id: 'bad', draw() {}, offset: 12}),
    /offset/,
  );
  assert.throws(
    () => new RoadScene(null, {world: 'glacier', scene: 'matrix'}),
    /aliases/,
  );
  assert.throws(
    () => new RoadScene(null, {runner: 'bookie', protagonist: 'courier'}),
    /aliases/,
  );
  assert.throws(
    () => new RoadScene(null, {worlds: ['unknown'], runners: [bookie]}),
    RangeError,
  );
});

test('stateful plugins enter, update, exit, re-enter and dispose once per scene', () => {
  const events = [];
  let created = 0;
  const runner = defineRunner({
    id: 'stateful',
    create(context) {
      assert.deepEqual(context, {id: 'stateful', kind: 'runner'});
      created++;
      return {
        count: 0,
        onEnter() {
          events.push('enter');
        },
        onExit() {
          events.push('exit');
        },
        update(frame) {
          this.count += frame.delta;
        },
        draw(mesh) {
          mesh.push(this.count);
        },
        dispose() {
          events.push('dispose');
        },
      };
    },
  });
  const other = defineRunner({id: 'other', draw() {}});
  const a = new PluginInstanceHost();
  const b = new PluginInstanceHost();
  const mesh = [];
  a.draw('runner', runner, mesh, {delta: 1});
  a.draw('runner', runner, mesh, {delta: 2});
  a.draw('runner', other, mesh, {});
  a.draw('runner', runner, mesh, {delta: 1});
  b.draw('runner', runner, mesh, {delta: 1});
  assert.deepEqual(mesh, [1, 3, 4, 1]);
  assert.equal(created, 2);
  a.dispose();
  a.dispose();
  b.dispose();
  assert.deepEqual(events, [
    'enter',
    'exit',
    'enter',
    'enter',
    'exit',
    'dispose',
    'exit',
    'dispose',
  ]);
  assert.throws(() => a.draw('runner', runner, mesh, {}), /disposed/);
});

test('world and runner are active independently and all resources release after hook errors', () => {
  const events = [];
  const host = new PluginInstanceHost();
  const make = (kind) => ({
    id: kind,
    create: () => ({
      draw() {},
      onExit() {
        events.push(kind + ' exit');
        throw Error('exit');
      },
      dispose() {
        events.push(kind + ' dispose');
        throw Error('dispose');
      },
    }),
  });
  host.draw('world', make('world'), {}, {});
  host.draw('runner', make('runner'), {}, {});
  assert.throws(
    () => host.dispose(),
    (error) => error instanceof AggregateError && error.errors.length === 4,
  );
  assert.deepEqual(events, [
    'world exit',
    'runner exit',
    'world dispose',
    'runner dispose',
  ]);
  host.dispose();
});

test('factory replaces preset geometry and rejects invalid synchronous instances', () => {
  const create = () => ({draw() {}});
  const registry = createPluginRegistry([
    glacier,
    defineWorld({id: 'factory', preset: 'glacier', create}),
  ]);
  const world = sceneCatalog(['factory'], registry.worlds)[0];
  assert.equal(world.create, create);
  assert.equal(world.draw, undefined);
  const draw = () => {};
  const override = sceneCatalog([{id: 'factory', draw}], registry.worlds)[0];
  assert.equal(override.draw, draw);
  assert.equal(override.create, undefined);
  for (const value of [
    undefined,
    null,
    3,
    Promise.resolve({}),
    {update: true},
    {draw: true},
  ]) {
    assert.throws(
      () =>
        new PluginInstanceHost().draw(
          'runner',
          {id: 'bad', draw() {}, create: () => value},
          {},
          {},
        ),
      TypeError,
    );
  }
});

test('native Three.js plugins mount, switch, animate and release exclusively owned resources', async () => {
  const {Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture} =
    await import('three');
  const {disposeObject3D} = await import('@shihangw/rowrunner/plugins');
  const roots = {world: new Group(), runner: new Group()};
  const host = new PluginInstanceHost(roots);
  const object = new Group();
  const geometry = new BoxGeometry();
  const texture = new Texture();
  const material = new MeshStandardMaterial({map: texture});
  object.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const disposed = [];
  for (const [name, resource] of Object.entries({
    geometry,
    material,
    texture,
  })) {
    resource.addEventListener('dispose', () => disposed.push(name));
  }
  const runner = defineRunner({
    id: 'native',
    create: () => ({
      object,
      update(frame) {
        object.rotation.y += frame.delta;
      },
      dispose() {
        disposeObject3D(object);
      },
    }),
  });
  const other = defineRunner({
    id: 'other-native',
    create: () => ({object: new Group()}),
  });
  host.draw('runner', runner, {}, {delta: 0.25});
  assert.equal(roots.runner.children[0], object);
  assert.equal(object.rotation.y, 0.25);
  assert.throws(
    () => new PluginInstanceHost(roots).draw('runner', runner, {}, {}),
    /already belongs/,
  );
  host.draw('runner', other, {}, {});
  assert.equal(object.parent, null);
  host.draw('runner', runner, {}, {delta: 0.25});
  assert.equal(object.rotation.y, 0.5);
  host.dispose();
  host.dispose();
  assert.deepEqual(
    new Set(disposed),
    new Set(['geometry', 'material', 'texture']),
  );
  assert.equal(disposed.length, 3);
  assert.equal(roots.runner.children.length, 0);
  assert.throws(
    () =>
      new PluginInstanceHost().draw(
        'runner',
        {id: 'bad-object', create: () => ({object: {}})},
        {},
        {},
      ),
    /Object3D/,
  );
});

test('applications supply all content and inheritance resolves independently of array order', () => {
  const base = defineWorld({
    id: 'base',
    draw() {},
    palette: {accent: [0.2, 0.3, 0.4]},
  });
  const variant = defineWorld({
    id: 'variant',
    preset: 'base',
    palette: {sky: [0, 0, 0]},
  });
  const registry = createPluginRegistry([variant, base]);
  assert.deepEqual(
    registry.worlds.map((w) => w.id),
    ['variant', 'base'],
  );
  assert.equal(registry.worlds[0].draw, base.draw);
  assert.deepEqual(registry.worlds[0].palette.accent, [0.2, 0.3, 0.4]);
  assert.deepEqual(registry.worlds[0].palette.sky, [0, 0, 0]);
  assert.throws(() => createPluginRegistry([variant]), /Unknown world preset/);
  assert.throws(
    () =>
      createPluginRegistry([
        defineWorld({id: 'a', preset: 'b'}),
        defineWorld({id: 'b', preset: 'a'}),
      ]),
    /Circular/,
  );
  assert.throws(() => new RoadScene(null), /nonempty/);
});
