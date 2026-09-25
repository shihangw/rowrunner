import test from 'node:test';
import assert from 'node:assert/strict';
import { RoadScene, CAMERA_MODES } from './fixtures/ExampleContentFixtures.js';
import { sceneCatalog, protagonistCatalog } from './fixtures/ExampleContentFixtures.js';
import { StationaryCameraPass } from '../src/CameraController.js';
import { drawMascot } from './fixtures/ExampleContentFixtures.js';

test('every camera points each model front along the road, independent of authored axis', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, value: 1 });
  try {
    for (const id of ['bookie', 'courier', 'paper-plane', 'custom']) {
      const localFront = id === 'bookie' || id === 'custom' ? -1 : 1;
      for (const mode of CAMERA_MODES)
        for (const distance of [0, 250, 650]) {
          const scene = Object.assign(Object.create(RoadScene.prototype), {
            scenes: sceneCatalog([{ id: 'empty', road: false, draw() {} }]),
            protagonists: protagonistCatalog([
              {
                id,
                ...(id === 'custom' ? {} : { preset: id }),
                bob: 0,
                roll: 0,
                offset: [0, 0, 0],
                draw(m) {
                  m.triangle([0, 0, 0], [0, 0, localFront], [1, 0, 0], [1, 1, 1]);
                },
              },
            ]),
            scenePreset: 'empty',
            mascotPreset: id,
            cameraMode: mode,
            distance,
            time: 0,
            cameraTime: 0,
            stationaryPass: new StationaryCameraPass(distance),
            biomeTransition: null,
            autoBiomes: false,
            reducedMotion: { matches: false },
            canvas: {
              width: 800,
              height: 450,
              getBoundingClientRect: () => ({ width: 800, height: 450 }),
            },
            sceneRenderer: { begin() {}, draw() {} },
          });
          if (mode === 'stationary') {
            scene.stationaryPass = new StationaryCameraPass(distance - 55);
            scene.distance = distance + 5;
          }
          scene.geometry = { triangle: scene.triangle.bind(scene) };
          scene.render(500, 0);
          const vertices = scene.vertices;
          const forward = [
            vertices[6] - vertices[0],
            vertices[7] - vertices[1],
            vertices[8] - vertices[2],
          ];
          const z = mode === 'stationary' ? 5 : 0;
          const slope =
            0.1 * Math.cos((distance + z) / 240) + 0.12 * Math.cos((distance + z) / 100);
          assert.ok(forward[2] > 0, `${id} faces backward in ${mode}`);
          assert.ok(
            Math.abs(forward[0] / forward[2] - slope) < 1e-6,
            `${id} misses road tangent in ${mode}`,
          );
        }
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'devicePixelRatio', previous);
    else delete globalThis.devicePixelRatio;
  }
});

test('model forward axes and propulsion wakes agree', () => {
  const presets = protagonistCatalog();
  assert.equal(presets.find((p) => p.id === 'bookie').forwardAxis, '-z');
  for (const id of ['courier', 'paper-plane'])
    assert.equal(presets.find((p) => p.id === id).forwardAxis, '+z');
  assert.equal(
    protagonistCatalog([{ id: 'robot', forwardAxis: '+z', draw() {} }])[0].forwardAxis,
    '+z',
  );
  assert.throws(() => protagonistCatalog([{ id: 'bookie', forwardAxis: 'sideways' }]), TypeError);
  const m = Object.assign(Object.create(RoadScene.prototype), { vertices: [] });
  drawMascot.bookie(m, 0, 500, false);
  // Every particle center trails the authored rear of the book.
  assert.ok(m.particles.length > 0);
  for (let i = 2; i < m.particles.length; i += 10) assert.ok(m.particles[i] > 1);
});
