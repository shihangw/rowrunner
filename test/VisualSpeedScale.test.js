import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadScene, CAMERA_MODES } from './fixtures/ExampleContentFixtures.js';
import { travelSpeed, StationaryCameraPass, stationaryPose } from '../src/CameraController.js';
import { sceneCatalog, protagonistCatalog } from './fixtures/ExampleContentFixtures.js';

test('visual speed lifts cruise, compresses boost, and stops continuously at zero', () => {
  assert.equal(travelSpeed(0), 0);
  assert.equal(travelSpeed(80), 40);
  assert.ok(travelSpeed(500) > 65 && travelSpeed(500) < 66);
  assert.ok(travelSpeed(1800) > 83 && travelSpeed(1800) < 84);
  assert.ok(travelSpeed(1e-9) < 1e-8);
  let previous = 0;
  for (const rate of [1e-9, 0.1, 1, 80, 500, 1800, 1e6, 1e12, Number.MAX_VALUE]) {
    const speed = travelSpeed(rate);
    assert.ok(Number.isFinite(speed) && speed > previous);
    previous = speed;
  }
  assert.equal(travelSpeed(80, 'linear'), 6);
  assert.equal(travelSpeed(1800, 'linear'), 135);
  assert.throws(() => new RoadScene(null, { speedScale: 'invalid' }), RangeError);
});

test('all cameras share visual travel while custom callbacks retain the original rate', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 1, configurable: true });
  try {
    for (const mode of CAMERA_MODES)
      for (const scale of ['logarithmic', 'linear'])
        for (const rate of [80, 500, 1800]) {
          let frame;
          const scene = Object.assign(Object.create(RoadScene.prototype), {
            scenes: sceneCatalog([{ id: 'empty', road: false, draw() {} }]),
            protagonists: protagonistCatalog([
              {
                id: 'probe',
                draw(m, f) {
                  frame = f;
                },
              },
            ]),
            scenePreset: 'empty',
            mascotPreset: 'probe',
            cameraMode: mode,
            speedScale: scale,
            distance: 0,
            time: 0,
            cameraTime: 0,
            stationaryPass: new StationaryCameraPass(),
            biomeTransition: null,
            autoBiomes: false,
            reducedMotion: { matches: false },
            geometry: {},
            canvas: {
              width: 800,
              height: 450,
              getBoundingClientRect: () => ({ width: 800, height: 450 }),
            },
            sceneRenderer: { begin() {}, draw() {} },
          });
          for (let i = 0; i < 20; i++) scene.render(rate, 0.05);
          assert.ok(Math.abs(scene.distance - travelSpeed(rate, scale)) < 1e-8);
          assert.equal(frame.rate, rate);
          assert.equal(frame.visualSpeed, travelSpeed(rate, scale));
          if (mode === 'stationary') {
            assert.equal(scene.stationaryPass.segmentLength, Math.max(180, frame.visualSpeed * 6));
            assert.ok(
              Math.abs(
                scene.stationaryPass.worldDistance +
                  scene.stationaryPass.frame.protagonistZ -
                  scene.distance,
              ) < 1e-8,
            );
            const pose = stationaryPose(scene.stationaryPass.frame, () => 0);
            scene.setSpeedScale(scale === 'linear' ? 'logarithmic' : 'linear');
            scene.render(rate, 0);
            assert.deepEqual(
              stationaryPose(scene.stationaryPass.frame, () => 0),
              pose,
            );
          }
          const distance = scene.distance;
          scene.render(rate, 0.05, { reduced: true });
          assert.equal(scene.distance, distance);
          assert.equal(frame.visualSpeed, 0);
          scene.render(0, 0.05);
          assert.equal(scene.distance, distance);
          const current = scene.speedScale;
          assert.throws(() => scene.setSpeedScale('invalid'), RangeError);
          assert.equal(scene.speedScale, current);
          const selectedCamera = scene.cameraMode,
            beforeCompletion = scene.distance;
          const oldPass = scene.stationaryPass;
          for (let i = 0; i < 3; i++) {
            scene.render(0, 0.05, { completed: true, reduced: i === 1 });
            assert.equal(scene.cameraShot, 'Approach');
            assert.equal(scene.cameraMode, selectedCamera);
            assert.equal(scene.distance, beforeCompletion);
            assert.equal(frame.near, -660);
            assert.equal(scene.stationaryPass, oldPass);
          }
          scene.render(0, 0, { completed: false });
          assert.equal(scene.cameraMode, selectedCamera);
          assert.equal(scene.distance, beforeCompletion);
          if (mode === 'stationary') {
            assert.notEqual(scene.stationaryPass, oldPass);
            assert.equal(scene.stationaryPass.startDistance, beforeCompletion);
            assert.ok(scene.cameraShot.startsWith('Stationary'));
          } else if (mode !== 'approach' && mode !== 'cinematic')
            assert.notEqual(scene.cameraShot, 'Approach');
        }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'devicePixelRatio', descriptor);
    else delete globalThis.devicePixelRatio;
  }
});
