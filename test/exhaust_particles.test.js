import test from 'node:test';
import assert from 'node:assert/strict';
import {drawExhaust} from '../examples/src/runners/shared/exhaust_particles.js';
import {RoadScene, CAMERA_MODES} from './fixtures/example_content_fixtures.js';
import {
  sceneCatalog,
  protagonistCatalog,
} from './fixtures/example_content_fixtures.js';
import {StationaryCameraPass} from '../src/camera_controller.js';

test('exhaust is bounded, deterministic and fades over particle lifetimes', () => {
  const collect = (time, rate, still = false) => {
    const particles = [];
    drawExhaust(
      {particle: (...p) => particles.push(p)},
      time,
      rate,
      still,
      [1, 0, 1],
      1,
    );
    return particles;
  };
  assert.deepEqual(collect(2, 0), []);
  assert.deepEqual(collect(2, 1800, true), []);
  for (const rate of [80, 500, 1800, 1e9]) {
    for (const time of [0, 1, 10000]) {
      const particles = collect(time, rate);
      assert.equal(particles.length, 66);
      for (const [center, radius, color, opacity] of particles) {
        assert.ok(center.every(Number.isFinite));
        assert.ok(center[2] > 1 && center[2] < 12);
        assert.ok(radius > 0 && radius < 0.3);
        assert.ok(color.every((v) => v >= 0 && v <= 1));
        assert.ok(opacity >= 0 && opacity <= 1);
      }
      assert.deepEqual(collect(time, rate), particles);
      assert.notDeepEqual(collect(time + 0.01, rate), particles);
    }
  }
  const extent = (rate) => Math.max(...collect(3, rate).map((p) => p[0][2]));
  assert.ok(extent(1800) > extent(500));
  assert.ok(extent(500) > extent(80));
});

test('Bookie exhaust trails in every camera, scales with the model and clears under reduced motion', () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'devicePixelRatio',
  );
  Object.defineProperty(globalThis, 'devicePixelRatio', {
    configurable: true,
    value: 1,
  });
  try {
    for (const preset of ['bookie']) {
      for (const mode of CAMERA_MODES) {
        const scene = Object.assign(Object.create(RoadScene.prototype), {
          scenes: sceneCatalog([{id: 'empty', road: false, draw() {}}]),
          protagonists: protagonistCatalog([
            {id: preset, scale: 2, bob: 0, roll: 0},
          ]),
          scenePreset: 'empty',
          mascotPreset: preset,
          cameraMode: mode,
          distance: 0,
          time: 2,
          cameraTime: 0,
          stationaryPass: new StationaryCameraPass(),
          biomeTransition: null,
          autoBiomes: false,
          reducedMotion: {matches: false},
          canvas: {
            width: 800,
            height: 450,
            getBoundingClientRect: () => ({width: 800, height: 450}),
          },
          sceneRenderer: {begin() {}, draw() {}},
        });
        // Built-in runners now use the same public geometry interface as plugins.
        scene.geometry = scene;
        scene.render(500, 0);
        assert.equal(scene.particles.length, 132 * 6 * 10);
        const heroZ = mode === 'stationary' ? -56 : -1;
        for (let i = 0; i < scene.particles.length; i += 10) {
          assert.ok(
            scene.particles[i + 2] < heroZ,
            `${preset} exhaust points forward in ${mode}`,
          );
          assert.ok(scene.particles[i + 8] > 0 && scene.particles[i + 8] < 0.6);
        }
        assert.ok(scene.particles.every(Number.isFinite));
        scene.render(500, 0, {reduced: true});
        assert.equal(scene.particles.length, 0);
        scene.render(0, 0);
        assert.equal(scene.particles.length, 0);
      }
    }
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'devicePixelRatio', previous);
    } else {
      delete globalThis.devicePixelRatio;
    }
  }
});
