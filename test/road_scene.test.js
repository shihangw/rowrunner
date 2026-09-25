import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RoadScene,
  SCENE_PRESETS,
  MASCOT_PRESETS,
} from './fixtures/example_content_fixtures.js';
import {drawMascot} from './fixtures/example_content_fixtures.js';
import {
  cameraPose,
  CinematicCameraDirector,
  CINEMATIC_SHOTS,
  StationaryCameraPass,
  stationaryPose,
  travelSpeed,
} from '../src/camera_controller.js';
import {
  sceneCatalog,
  protagonistCatalog,
} from './fixtures/example_content_fixtures.js';
import {SPACE_MODELS} from '../examples/src/assets/space-kit.js';

test('preset metadata can be imported without browser globals and invalid options fail early', () => {
  assert.ok(SCENE_PRESETS.some((p) => p.id === 'glacier'));
  assert.equal(
    SCENE_PRESETS.some((p) => p.id === 'library'),
    false,
  );
  assert.throws(() => new RoadScene(null, {world: 'library'}), RangeError);
  assert.ok(MASCOT_PRESETS.some((p) => p.id === 'bookie'));
  assert.throws(() => new RoadScene(null, {scene: 'unknown'}), RangeError);
  assert.throws(() => new RoadScene(null, {mascot: 'unknown'}), RangeError);
  for (const interval of [0, -1, NaN, Infinity, '20']) {
    assert.throws(
      () => new RoadScene(null, {worldSwitchIntervalSeconds: interval}),
      /worldSwitchIntervalSeconds/,
    );
  }
});

test('changing presets preserves travel and invalid selections leave the current preset intact', () => {
  // Test the presentation API independently of a GPU or browser.
  const scene = Object.assign(Object.create(RoadScene.prototype), {
    scenes: sceneCatalog(),
    protagonists: protagonistCatalog(),
  });
  Object.assign(scene, {
    distance: 1234,
    time: 45,
    scenePreset: 'midnight',
    mascotPreset: 'courier',
  });
  scene.setScene('glacier');
  scene.setMascot('bookie');
  assert.equal(scene.distance, 1234);
  assert.equal(scene.time, 45);
  assert.throws(() => scene.setScene('__proto__'), RangeError);
  assert.throws(() => scene.setMascot(null), RangeError);
  assert.equal(scene.scenePreset, 'glacier');
  assert.equal(scene.mascotPreset, 'bookie');
});

test('mascot meshes contain only finite vertices and colors, including at rest and at high speed', () => {
  for (const preset of MASCOT_PRESETS) {
    for (const rate of [0, 500, 1_000_000]) {
      const mesh = Object.assign(Object.create(RoadScene.prototype), {
        scenes: sceneCatalog(),
        protagonists: protagonistCatalog(),
      });
      mesh.vertices = [];
      drawMascot[preset.id](mesh, 3.5, rate, rate === 0);
      assert.ok(mesh.vertices.length > 0, `${preset.id}: empty geometry`);
      assert.equal(
        mesh.vertices.length % 18,
        0,
        `${preset.id}: incomplete triangles`,
      );
      assert.ok(
        mesh.vertices.every(Number.isFinite),
        `${preset.id}: nonfinite geometry`,
      );
      for (let i = 0; i < mesh.vertices.length; i++) {
        if (i % 6 >= 3) {
          assert.ok(mesh.vertices[i] >= 0 && mesh.vertices[i] <= 1);
        }
      }
    }
  }
});

test('manual camera poses remain fixed and approach faces the protagonist', () => {
  for (const mode of ['chase', 'approach', 'side', 'aerial', 'stationary']) {
    assert.deepEqual(cameraPose(0, mode), cameraPose(999, mode));
  }
  const approach = cameraPose(0, 'approach');
  assert.ok(approach.eye[2] > 0 && approach.target[2] < approach.eye[2]);
  assert.throws(() => cameraPose(0, 'invalid'), RangeError);
});

test('cinematic visits all ten views once per shuffled cycle, with fixed full stationary passes', () => {
  let seed = 71;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const director = new CinematicCameraDirector(0, random);
  const seen = [];
  assert.equal(director.shot, 'side');
  assert.deepEqual(director.pose(), cameraPose(0, 'side'));
  assert.deepEqual(cameraPose(0, 'cinematic'), director.pose());
  let distance = 0;
  for (let visit = 0; visit < 30; visit++) {
    const shot = director.shot;
    assert.notEqual(shot, seen.at(-1));
    seen.push(shot);
    let elapsed = 0;
    let fixed;
    while (director.shot === shot && elapsed < 30) {
      distance += travelSpeed(500) * 0.05;
      director.advance(500, 0.05, distance);
      elapsed += 0.05;
      if (director.shot === shot && director.pass) {
        const pose = stationaryPose(director.pass.frame, () => 0);
        if (fixed) {
          assert.deepEqual(pose, fixed);
        } else {
          fixed = pose;
        }
        assert.ok(
          Math.abs(
            director.pass.worldDistance +
              director.pass.frame.protagonistZ -
              distance,
          ) < 1e-8,
        );
      }
    }
    assert.notEqual(director.shot, shot);
    assert.ok(elapsed >= 6 - 1e-8);
    const frozen = JSON.stringify(director);
    director.advance(0, 100, distance);
    assert.equal(JSON.stringify(director), frozen);
  }
  for (let cycle = 0; cycle < 3; cycle++) {
    assert.deepEqual(
      new Set(seen.slice(cycle * 10, cycle * 10 + 10)),
      new Set(CINEMATIC_SHOTS),
    );
  }
  assert.notDeepEqual(seen.slice(0, 10), seen.slice(10, 20));
});

test('cinematic tracking blends stay continuous and orbit clear of the protagonist', () => {
  for (const from of ['chase', 'side', 'starboard', 'aerial', 'approach']) {
    for (const to of ['chase', 'side', 'starboard', 'aerial', 'approach']) {
      const director = new CinematicCameraDirector(0, () => 0.5);
      director.shot = from;
      director.pass = null;
      director.remaining = [to];
      director.next(0);
      let previous;
      for (let i = 0; i <= 400; i++) {
        director.elapsed = i / 100;
        const pose = director.pose();
        assert.ok(
          Math.hypot(
            pose.eye[0] - pose.target[0],
            pose.eye[2] - pose.target[2],
          ) >= 10,
        );
        assert.ok([...pose.eye, ...pose.target].every(Number.isFinite));
        if (previous) {
          for (const key of ['eye', 'target']) {
            for (let axis = 0; axis < 3; axis++) {
              assert.ok(Math.abs(pose[key][axis] - previous[key][axis]) < 0.5);
            }
          }
        }
        previous = pose;
      }
    }
  }
});

test('automatic biomes fade through all seven worlds without resetting distance', () => {
  const scene = Object.assign(Object.create(RoadScene.prototype), {
    scenes: sceneCatalog(),
    protagonists: protagonistCatalog(),
  });
  Object.assign(scene, {
    scenePreset: 'midnight',
    distance: 0,
    time: 0,
    autoBiomes: true,
    worldElapsedSeconds: 0,
    worldSwitchIntervalSeconds: 20,
    biomeTransition: null,
  });
  assert.equal(SCENE_PRESETS.length, 7);
  for (const next of [
    'clouds',
    'ember',
    'glacier',
    'matrix',
    'sea-storm',
    'black-holes',
    'midnight',
  ]) {
    scene.distance += 2200;
    scene.worldElapsedSeconds = 20;
    const distance = scene.distance;
    assert.equal(scene.updateBiome().fade, 0);
    scene.time += 3;
    assert.equal(scene.updateBiome().fade, 1);
    assert.equal(scene.scenePreset, next);
    scene.time += 3;
    scene.updateBiome();
    assert.equal(scene.biomeTransition, null);
    assert.equal(scene.distance, distance);
  }
  scene.setAutoBiomes(false);
  scene.distance += 10000;
  scene.updateBiome();
  assert.equal(scene.scenePreset, 'midnight');
  scene.setScene('glacier');
  scene.setAutoBiomes(true);
  scene.updateBiome();
  assert.equal(scene.scenePreset, 'glacier');
  assert.throws(() => scene.setAutoBiomes('yes'), TypeError);
});

test('downloaded scenery converts to finite renderable triangles', () => {
  const mesh = Object.assign(Object.create(RoadScene.prototype), {
    scenes: sceneCatalog(),
    protagonists: protagonistCatalog(),
  });
  for (const name of Object.keys(SPACE_MODELS)) {
    mesh.vertices = [];
    mesh.model(SPACE_MODELS[name], [10, 2, 20], 5, 0.5, [0.2, 0.8, 0.9]);
    assert.ok(mesh.vertices.length > 0);
    assert.ok(mesh.vertices.every(Number.isFinite), name);
  }
});

test('custom catalogs copy caller data and isolate scene instances', () => {
  const palette = {accent: [0.2, 0.4, 0.8]};
  const input = [{id: 'blue-city', preset: 'midnight', palette}];
  const worlds = sceneCatalog(input);
  palette.accent[0] = 1;
  input.push('clouds');
  assert.equal(worlds.length, 1);
  assert.deepEqual(worlds[0].palette.accent, [0.2, 0.4, 0.8]);
  assert.ok(Object.isFrozen(worlds[0].palette.accent));
  assert.ok(Object.isFrozen(worlds));
  assert.notDeepEqual(
    sceneCatalog()[0].palette.accent,
    worlds[0].palette.accent,
  );
  const offset = [1, 3, -2];
  const heroes = protagonistCatalog([
    {id: 'tiny-bookie', preset: 'bookie', scale: 0.7, offset, bob: 0, roll: 0},
  ]);
  offset[0] = 10;
  assert.deepEqual(heroes[0].offset, [1, 3, -2]);
  assert.equal(heroes[0].bob, 0);
});

test('invalid custom definitions fail before acquiring browser resources', () => {
  for (const scenes of [
    [],
    Array(1),
    ['missing'],
    ['glacier', 'glacier'],
    [{id: 'empty'}],
    [{id: 'x', preset: 'missing'}],
    [{id: 'x', preset: 'clouds', palette: {accent: [2, 0, 0]}}],
    [{id: 'x', preset: 'clouds', road: 'yes'}],
    [{id: 'x', draw: true}],
  ]) {
    assert.throws(
      () => new RoadScene(null, {scenes}),
      /scenes|palette|accent|road/,
    );
  }
  for (const protagonists of [
    [],
    ['bookie', 'bookie'],
    [{id: 'x'}],
    [{id: 'x', preset: 'bookie', scale: 0}],
    [{id: 'x', preset: 'bookie', offset: [0, NaN, 0]}],
    [{id: 'x', preset: 'bookie', roll: -1}],
  ]) {
    assert.throws(
      () => new RoadScene(null, {protagonists}),
      /protagonists|scale|offset|roll/,
    );
  }
  assert.throws(
    () =>
      new RoadScene(null, {
        scenes: [{id: 'glacier', palette: {accent: Array(3)}}],
      }),
    TypeError,
  );
  assert.throws(
    () => new RoadScene(null, {protagonist: 'bookie', mascot: 'courier'}),
    /must agree/,
  );
  assert.throws(
    () => new RoadScene(null, {scenes: ['glacier'], scene: 'clouds'}),
    RangeError,
  );
});

test('journeys follow custom lineup order and a single scene never fades to itself', () => {
  const scene = Object.assign(Object.create(RoadScene.prototype), {
    scenes: sceneCatalog([
      {id: 'custom', preset: 'ember', palette: {accent: [0.2, 0.3, 0.4]}},
      'clouds',
    ]),
    protagonists: protagonistCatalog(['bookie', {id: 'scout', draw() {}}]),
    scenePreset: 'custom',
    distance: 2200,
    time: 0,
    autoBiomes: true,
    worldElapsedSeconds: 0,
    worldSwitchIntervalSeconds: 20,
    biomeTransition: null,
  });
  scene.worldElapsedSeconds = 20;
  scene.updateBiome();
  scene.time = 6;
  scene.updateBiome();
  assert.equal(scene.scenePreset, 'clouds');
  scene.distance += 2200;
  scene.worldElapsedSeconds = 20;
  scene.updateBiome();
  scene.time += 6;
  scene.updateBiome();
  assert.equal(scene.scenePreset, 'custom');
  assert.deepEqual(scene.updateBiome().palette.accent, [0.2, 0.3, 0.4]);
  scene.setProtagonist('scout');
  assert.equal(scene.mascotPreset, 'scout');
  scene.setMascot('bookie');
  assert.equal(scene.protagonist, 'bookie');
  assert.throws(() => scene.setProtagonist('courier'), RangeError);
  assert.equal(scene.protagonist, 'bookie');
  assert.equal(scene.distance, 4400);
  scene.scenes = sceneCatalog(['glacier']);
  scene.setScene('glacier');
  scene.distance += 10000;
  scene.updateBiome();
  assert.equal(scene.biomeTransition, null);
});

test('stationary road segments preserve the same world speed and take at least six seconds', () => {
  for (const rate of [80, 500, 1800, 1e9]) {
    const pass = new StationaryCameraPass(500);
    let distance = 500;
    let elapsed = 0;
    while (pass.startDistance === 500 && elapsed < 40) {
      const previousZ = pass.frame.protagonistZ;
      distance += travelSpeed(rate) * 0.05;
      pass.advance(rate, 0.05, distance);
      elapsed += 0.05;
      const frame = pass.frame;
      assert.ok(
        Math.abs(frame.worldDistance + frame.protagonistZ - distance) < 1e-6,
      );
      if (pass.startDistance === 500) {
        assert.ok(
          Math.abs(frame.protagonistZ - previousZ - travelSpeed(rate) * 0.05) <
            1e-6,
        );
      }
    }
    assert.ok(elapsed >= 6 - 1e-8, `rate ${rate}: pass too short (${elapsed})`);
    assert.ok(elapsed <= 30.1, `rate ${rate}: pass did not finish`);
    assert.ok(Math.abs(pass.frame.protagonistZ + 55) < 1e-8);
    assert.equal(pass.segmentLength, Math.max(180, travelSpeed(rate) * 6));
  }
});

test('stationary speed spikes do not slow travel or move the camera before the minimum shot time', () => {
  const pass = new StationaryCameraPass(0);
  let distance = 0;
  for (let i = 0; i < 20; i++) {
    distance += travelSpeed(80) * 0.05;
    pass.advance(80, 0.05, distance);
  }
  const fixedOrigin = pass.worldDistance;
  const fixedLength = pass.segmentLength;
  for (let i = 0; i < 79; i++) {
    const previous = pass.frame.protagonistZ;
    distance += travelSpeed(1800) * 0.05;
    pass.advance(1800, 0.05, distance);
    assert.ok(
      Math.abs(pass.frame.protagonistZ - previous - travelSpeed(1800) * 0.05) <
        1e-8,
    );
    assert.equal(pass.worldDistance, fixedOrigin);
    assert.equal(pass.segmentLength, fixedLength);
  }
  const before = pass.frame;
  pass.advance(0, 0.05, distance);
  assert.deepEqual(pass.frame, before);
});

test('changing cameras preserves travel and only a fresh stationary selection restarts the pass', () => {
  const scene = Object.assign(Object.create(RoadScene.prototype), {
    distance: 1234,
    cameraMode: 'chase',
  });
  scene.setCamera('stationary');
  assert.equal(scene.stationaryPass.worldDistance, 1289);
  const pass = scene.stationaryPass;
  pass.advance(500, 0.05, 1235);
  scene.distance += 20;
  scene.setCamera('stationary');
  assert.equal(scene.stationaryPass, pass);
  assert.throws(() => scene.setCamera('invalid'), RangeError);
  assert.equal(scene.cameraMode, 'stationary');
  scene.setCamera('side');
  scene.setCamera('stationary');
  assert.notEqual(scene.stationaryPass, pass);
  assert.equal(scene.stationaryPass.worldDistance, 1309);
  assert.equal(scene.distance, 1254);
});

test('stationary camera chooses either side only when a new pass starts', () => {
  const choices = [0.1, 0, 0.9, 0, 0.2, 0];
  let calls = 0;
  const pass = new StationaryCameraPass(0, () => choices[calls++]);
  const centerX = (z) => z * 0.1;
  assert.equal(pass.frame.side, -1);
  const left = stationaryPose(pass.frame, centerX);
  assert.equal(left.eye[0], centerX(left.eye[2]) - 18);
  const speed = travelSpeed(500);
  pass.advance(500, 1, speed);
  const fixed = stationaryPose(pass.frame, centerX);
  pass.advance(500, 4, speed * 5);
  assert.deepEqual(stationaryPose(pass.frame, centerX), fixed);
  assert.equal(calls, 2);
  pass.advance(500, 1, speed * 6);
  assert.equal(pass.frame.side, 1);
  assert.equal(calls, 4);
  const right = stationaryPose(pass.frame, centerX);
  assert.equal(right.eye[0], centerX(right.eye[2]) + 18);
  pass.advance(0, 100, speed * 6);
  assert.equal(pass.frame.side, 1);
  assert.equal(calls, 4);
  pass.advance(500, 6, speed * 12);
  assert.equal(pass.frame.side, -1);
  assert.equal(calls, 6);
});

test('stationary cuts cover five distinct angles without changing a shot in progress', () => {
  const pass = new StationaryCameraPass(0, () => 0.3);
  const firstDeck = new Set();
  const centerX = (z) => Math.sin(z / 100) * 12;
  let previous;
  for (let cut = 0; cut < 15; cut++) {
    pass.advance(500, 0, pass.distance);
    const shot = pass.frame.shot;
    assert.notEqual(shot, previous);
    if (cut < 5) {
      firstDeck.add(shot);
    }
    const pose = stationaryPose(pass.frame, centerX);
    assert.ok(pose.eye.every(Number.isFinite));
    assert.ok(pose.eye[1] >= 23);
    if (shot === 'approach') {
      assert.ok(pose.eye[2] > pose.target[2]);
    }
    if (shot === 'departure' || shot === 'diagonal') {
      assert.ok(pose.eye[2] < pose.target[2]);
    }
    if (shot === 'crossing') {
      assert.equal(pose.eye[2], pose.target[2]);
    }
    const horizontal = Math.hypot(
      pose.eye[0] - pose.target[0],
      pose.eye[2] - pose.target[2],
    );
    assert.ok(
      Math.atan2(pose.eye[1] - pose.target[1], horizontal) < Math.PI / 4,
      'Passing camera is too close to a top-down view',
    );
    pass.advance(500, 3, pass.startDistance + pass.segmentLength / 2);
    assert.deepEqual(stationaryPose(pass.frame, centerX), pose);
    pass.advance(0, 30, pass.distance);
    assert.deepEqual(stationaryPose(pass.frame, centerX), pose);
    pass.advance(500, 3, pass.startDistance + pass.segmentLength + 1e-8);
    previous = shot;
  }
  assert.deepEqual(
    firstDeck,
    new Set(['approach', 'departure', 'crossing', 'diagonal', 'overlook']),
  );
});

for (const [rate, intervalSeconds] of [
  [80, 20],
  [1e9, 37],
]) {
  test(`scheduled worlds fade with cinematic shots at ${intervalSeconds}s and rate ${rate}`, () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'devicePixelRatio',
    );
    Object.defineProperty(globalThis, 'devicePixelRatio', {
      value: 1,
      configurable: true,
    });
    try {
      const worldIDs = ['first', 'second', 'third'];
      const scene = Object.assign(Object.create(RoadScene.prototype), {
        scenes: sceneCatalog(
          worldIDs.map((id) => ({id, road: false, draw() {}})),
        ),
        protagonists: protagonistCatalog([{id: 'probe', draw() {}}]),
        scenePreset: worldIDs[0],
        mascotPreset: 'probe',
        cameraMode: 'cinematic',
        cinematic: new CinematicCameraDirector(0, () => 0.3),
        speedScale: 'logarithmic',
        distance: 0,
        time: 0,
        cameraTime: 0,
        worldElapsedSeconds: 0,
        worldSwitchIntervalSeconds: intervalSeconds,
        biomeTransition: null,
        autoBiomes: true,
        reducedMotion: {matches: false},
        geometry: {},
        canvas: {
          width: 800,
          height: 450,
          getBoundingClientRect: () => ({width: 800, height: 450}),
        },
        sceneRenderer: {
          begin(_width, _height, _palette, _sky, _time, fade) {
            this.fade = fade;
          },
          draw() {},
        },
      });
      let worldChanges = 0;
      let cameraChanges = 0;
      let shotDuration = 0;
      let worldDuration = 0;
      let sawFadeOut = false;
      let sawFadeIn = false;
      for (let frame = 0; frame < 6000 && worldChanges < 6; frame++) {
        const previousShot = scene.cinematic.shot;
        const previousWorld = scene.world;
        scene.render(rate, 0.05);
        shotDuration += 0.05;
        worldDuration += 0.05;
        const cameraChanged = previousShot !== scene.cinematic.shot;
        const worldChanged = scene.world !== previousWorld;
        const transition = scene.biomeTransition;
        if (
          transition &&
          scene.sceneRenderer.fade > 0 &&
          scene.sceneRenderer.fade < 1
        ) {
          if (scene.world === transition.from) {
            sawFadeOut = true;
          } else {
            sawFadeIn = true;
          }
        }
        if (cameraChanged) {
          cameraChanges++;
          assert.ok(shotDuration >= 6 - 1e-8);
          shotDuration = 0;
        }
        if (worldChanged) {
          worldChanges++;
          assert.equal(cameraChanged, true);
          assert.equal(scene.sceneRenderer.fade, 1);
          assert.ok(worldDuration >= intervalSeconds);
          assert.equal(scene.world, worldIDs[worldChanges % worldIDs.length]);
          worldDuration = 0;
        }
      }
      assert.equal(worldChanges, 6);
      assert.ok(cameraChanges > worldChanges);
      assert.ok(sawFadeOut && sawFadeIn);
      const world = scene.world;
      const shot = scene.cinematic.shot;
      for (let frame = 0; frame < 400; frame++) {
        scene.render(0, 0.05);
        scene.render(rate, 0.05, {reduced: true});
        scene.render(rate, 0.05, {completed: true});
      }
      assert.equal(scene.world, world);
      assert.equal(scene.cinematic.shot, shot);
      scene.setAutoBiomes(false);
      for (let frame = 0; frame < 400; frame++) {
        scene.render(rate, 0.05);
      }
      assert.notEqual(scene.cinematic.shot, shot);
      assert.equal(scene.world, world);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'devicePixelRatio', descriptor);
      } else {
        delete globalThis.devicePixelRatio;
      }
    }
  });
}
