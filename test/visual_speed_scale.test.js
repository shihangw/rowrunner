import test from 'node:test';
import assert from 'node:assert/strict';
import {RoadScene, CAMERA_MODES} from './fixtures/example_content_fixtures.js';
import {
  travelSpeed,
  StationaryCameraPass,
  stationaryPose,
} from '../src/camera_controller.js';
import {
  sceneCatalog,
  protagonistCatalog,
} from './fixtures/example_content_fixtures.js';

test('visual speed lifts cruise, compresses boost, and stops continuously at zero', () => {
  assert.equal(travelSpeed(0), 0);
  assert.equal(travelSpeed(100), 40);
  assert.equal(travelSpeed(8 * 12.5), travelSpeed(100));
  assert.ok(travelSpeed(500) > 62 && travelSpeed(500) < 63);
  assert.equal(travelSpeed(1800), 80);
  assert.ok(travelSpeed(1e-9) < 1e-8);
  let previous = 0;
  for (const rate of [
    1e-9,
    0.1,
    1,
    80,
    100,
    500,
    1800,
    1e6,
    1e12,
    Number.MAX_VALUE,
  ]) {
    const speed = travelSpeed(rate);
    assert.ok(Number.isFinite(speed) && speed > previous);
    previous = speed;
  }
  assert.equal(travelSpeed(80, 'linear'), 6);
  assert.equal(travelSpeed(1800, 'linear'), 135);
  assert.throws(() => new RoadScene(null, {speedScale: 'invalid'}), RangeError);
  assert.throws(
    () => new RoadScene(null, {visualRateMultiplier: 0}),
    TypeError,
  );
});

test('all cameras share visual travel while custom callbacks retain the original rate', () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'devicePixelRatio',
  );
  Object.defineProperty(globalThis, 'devicePixelRatio', {
    value: 1,
    configurable: true,
  });
  try {
    for (const mode of CAMERA_MODES) {
      for (const scale of ['logarithmic', 'linear']) {
        for (const rate of [8, 80, 500, 1800]) {
          let frame;
          const scene = Object.assign(Object.create(RoadScene.prototype), {
            scenes: sceneCatalog([{id: 'empty', road: false, draw() {}}]),
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
            visualRateMultiplier: 1,
            distance: 0,
            time: 0,
            cameraTime: 0,
            stationaryPass: new StationaryCameraPass(),
            biomeTransition: null,
            autoBiomes: false,
            reducedMotion: {matches: false},
            geometry: {},
            canvas: {
              width: 800,
              height: 450,
              getBoundingClientRect: () => ({width: 800, height: 450}),
            },
            sceneRenderer: {begin() {}, draw() {}},
          });
          for (let i = 0; i < 20; i++) {
            scene.render(rate, 0.05);
          }
          assert.ok(Math.abs(scene.distance - travelSpeed(rate, scale)) < 1e-8);
          assert.equal(frame.rate, rate);
          assert.equal(frame.visualSpeed, travelSpeed(rate, scale));
          if (rate === 8) {
            const distanceBeforeBoost = scene.distance;
            scene.setVisualRateMultiplier(12.5);
            scene.render(rate, 0.05);
            assert.ok(
              Math.abs(
                scene.distance -
                  distanceBeforeBoost -
                  travelSpeed(100, scale) * 0.05,
              ) < 1e-8,
            );
            assert.equal(frame.rate, rate);
            assert.equal(frame.visualSpeed, travelSpeed(100, scale));
            scene.setVisualRateMultiplier(1);
            scene.render(rate, 0);
          }
          for (const invalidMultiplier of [0, -1, NaN, Infinity]) {
            assert.throws(
              () => scene.setVisualRateMultiplier(invalidMultiplier),
              TypeError,
            );
            assert.equal(scene.visualRateMultiplier, 1);
          }
          if (mode === 'stationary') {
            assert.equal(
              scene.stationaryPass.segmentLength,
              Math.max(180, frame.visualSpeed * 6),
            );
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
          scene.render(rate, 0.05, {reduced: true});
          assert.equal(scene.distance, distance);
          assert.equal(frame.visualSpeed, 0);
          scene.render(0, 0.05);
          assert.equal(scene.distance, distance);
          const current = scene.speedScale;
          assert.throws(() => scene.setSpeedScale('invalid'), RangeError);
          assert.equal(scene.speedScale, current);
          const selectedCamera = scene.cameraMode;
          const beforeCompletion = scene.distance;
          const oldPass = scene.stationaryPass;
          for (let i = 0; i < 3; i++) {
            scene.render(0, 0.05, {completed: true, reduced: i === 1});
            assert.equal(scene.cameraShot, 'Approach');
            assert.equal(scene.cameraMode, selectedCamera);
            assert.equal(scene.distance, beforeCompletion);
            assert.equal(frame.near, -660);
            assert.equal(scene.stationaryPass, oldPass);
          }
          scene.render(0, 0, {completed: false});
          assert.equal(scene.cameraMode, selectedCamera);
          assert.equal(scene.distance, beforeCompletion);
          if (mode === 'stationary') {
            assert.notEqual(scene.stationaryPass, oldPass);
            assert.equal(scene.stationaryPass.startDistance, beforeCompletion);
            assert.ok(scene.cameraShot.startsWith('Stationary'));
          } else if (mode !== 'approach' && mode !== 'cinematic') {
            assert.notEqual(scene.cameraShot, 'Approach');
          }
        }
      }
    }
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'devicePixelRatio', descriptor);
    } else {
      delete globalThis.devicePixelRatio;
    }
  }
});
