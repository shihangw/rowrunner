import test from 'node:test';
import assert from 'node:assert/strict';
import {RoadScene} from './fixtures/example_content_fixtures.js';
import {roadSurface, drawRoad} from '../src/road_geometry.js';
import {
  sceneCatalog,
  protagonistCatalog,
} from './fixtures/example_content_fixtures.js';
import {StationaryCameraPass, travelSpeed} from '../src/camera_controller.js';

const palette = sceneCatalog()[0].palette;

test('renewal advances forward, retains repaired panels, and can be disabled without changing travel', () => {
  const ahead = roadSurface(palette, 110, 100, 'renewal');
  const behind = roadSurface(palette, 90, 100, 'renewal');
  assert.equal(ahead.amount, 0);
  assert.equal(behind.amount, 1);
  assert.deepEqual(behind.accent, palette.accent);
  assert.ok(roadSurface(palette, 96, 100, 'renewal').amount > 0);
  assert.deepEqual(roadSurface(palette, 90, 250, 'renewal'), behind);
  assert.deepEqual(roadSurface(palette, 110, 100, 'none').road, palette.road);
  assert.throws(() => new RoadScene(null, {roadEffect: 'typo'}), RangeError);
  const scene = Object.assign(Object.create(RoadScene.prototype), {
    distance: 123,
    time: 45,
    roadEffect: 'renewal',
  });
  assert.throws(() => scene.setRoadEffect(true), RangeError);
  assert.equal(scene.roadEffect, 'renewal');
  scene.setRoadEffect('none');
  assert.equal(scene.distance, 123);
  assert.equal(scene.time, 45);
});

test('road panels and wear stay anchored when the camera origin changes', () => {
  const collect = (distance) => {
    const panels = [];
    drawRoad(
      {
        quad(a, b, c, d, color) {
          if (a[1] === 0 && b[1] === 0 && a[0] === -7) {
            const worldZ = Math.round((a[2] + distance) * 100) / 100;
            if (worldZ >= 100 && worldZ < 200) {
              panels.push({worldZ, color});
            }
          }
        },
      },
      {
        distance,
        front: 150,
        centerX: () => 0,
        palette,
        far: 660,
        effect: 'renewal',
      },
    );
    return panels;
  };
  assert.equal(collect(100).length, 20);
  assert.deepEqual(collect(100), collect(153.7));
});

test('rendered renewal follows an offset protagonist in stationary and tracking cameras, freezing at rest', () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'devicePixelRatio',
  );
  Object.defineProperty(globalThis, 'devicePixelRatio', {
    configurable: true,
    value: 1,
  });
  try {
    for (const mode of ['stationary', 'chase']) {
      const scene = Object.assign(Object.create(RoadScene.prototype), {
        scenes: sceneCatalog([{id: 'empty', draw() {}}]),
        protagonists: protagonistCatalog([
          {id: 'orb', offset: [0, 2, 9], draw() {}},
        ]),
        scenePreset: 'empty',
        mascotPreset: 'orb',
        cameraMode: mode,
        distance: 100,
        time: 0,
        cameraTime: 0,
        roadEffect: 'renewal',
        stationaryPass: new StationaryCameraPass(100),
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
      scene.geometry = {quad: scene.quad.bind(scene)};
      const checkFront = () => {
        scene.render(0, 0);
        const origin =
          mode === 'stationary'
            ? scene.stationaryPass.frame.worldDistance
            : scene.distance;
        // The sweep's leading white line sits at .045 above the deck.
        const points = [];
        for (let i = 0; i < scene.vertices.length; i += 6) {
          if (scene.vertices[i + 1] === 0.045) {
            points.push(scene.vertices[i + 2] + origin);
          }
        }
        assert.ok(points.length > 0);
        assert.ok(
          Math.abs(Math.max(...points) - (scene.distance + 9 + 0.03)) < 1e-8,
        );
        assert.ok(scene.vertices.every(Number.isFinite));
      };
      checkFront();
      for (let i = 0; i < 60; i++) {
        scene.render(500, 1 / 60);
      }
      assert.ok(Math.abs(scene.distance - (100 + travelSpeed(500))) < 1e-8);
      checkFront();
      const frozen = scene.vertices.slice();
      scene.render(0, 0.05);
      assert.deepEqual(scene.vertices, frozen);
      scene.render(1800, 0.05, {reduced: true});
      assert.deepEqual(scene.vertices, frozen);
    }
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, 'devicePixelRatio', previous);
    } else {
      delete globalThis.devicePixelRatio;
    }
  }
});
