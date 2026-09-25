import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seaHeight,
  stormFlash,
  drawStorm,
} from '../examples/src/worlds/sea-storm/SeaStormGeometry.js';
import { SPACE_MODELS } from '../examples/src/assets/space-kit.js';
import { PALETTES } from './fixtures/ExampleContentFixtures.js';
import { RoadScene } from './fixtures/ExampleContentFixtures.js';

test('storm waves remain below the causeway and lightning is disabled for reduced motion', () => {
  for (const time of [0, 8, 8.8, 9.6, 19, 27.8, 100000]) {
    for (let x = -260; x < 260; x += 17)
      for (let z = -100; z < 700; z += 37) {
        const height = seaHeight(x, z, time);
        assert.ok(Number.isFinite(height) && height < -1.9 && height > -5.7);
      }
    assert.equal(stormFlash(time, true), 0);
    assert.ok(stormFlash(time) >= 0 && stormFlash(time) <= 1);
  }
  assert.ok(stormFlash(8.8) > 0.99);
  assert.equal(stormFlash(0), 0);
  assert.equal(stormFlash(10), 0);
});

test('storm geometry stays finite with bounded colors at travel and lightning boundaries', () => {
  const mesh = Object.create(RoadScene.prototype);
  for (const [distance, time, reduced] of [
    [0, 0, false],
    [55.99, 8.8, false],
    [56, 8.8, true],
    [100000, 100000, false],
  ]) {
    mesh.vertices = [];
    const model = RoadScene.prototype.model.bind(mesh);
    mesh.model = (name, ...args) => model(SPACE_MODELS[name], ...args);
    drawStorm(mesh, distance, (z) => Math.sin(z / 100) * 10, PALETTES['sea-storm'], time, reduced);
    assert.ok(mesh.vertices.length > 0 && mesh.vertices.length % 18 === 0);
    assert.ok(mesh.vertices.every(Number.isFinite));
    for (let i = 0; i < mesh.vertices.length; i++)
      if (i % 6 >= 3) assert.ok(mesh.vertices[i] >= 0 && mesh.vertices[i] <= 1);
  }
});
