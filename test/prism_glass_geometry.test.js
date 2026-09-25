import test from 'node:test';
import assert from 'node:assert/strict';
import {RoadScene} from './fixtures/example_content_fixtures.js';
import {drawMascot} from './fixtures/example_content_fixtures.js';

test('Prism has twenty finite translucent facets and normalized transformed normals', () => {
  for (const time of [0, 2, 10000]) {
    const mesh = Object.assign(Object.create(RoadScene.prototype), {
      vertices: [],
      glass: [],
      particles: [],
      transform: ([x, y, z]) => [z * 2 + 10, y * 2 + 3, -x * 2 - 50],
    });
    drawMascot.courier(mesh, time, 500, false);
    assert.equal(mesh.glass.length, 20 * 3 * 10);
    assert.ok(mesh.glass.every(Number.isFinite));
    for (let i = 0; i < mesh.glass.length; i += 10) {
      const normal = mesh.glass.slice(i + 3, i + 6);
      assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-12);
      assert.ok(mesh.glass.slice(i + 6, i + 9).every((v) => v >= 0 && v <= 1));
      assert.ok(mesh.glass[i + 9] > 0 && mesh.glass[i + 9] < 1);
    }
    assert.ok(mesh.vertices.every(Number.isFinite));
    // Both glow layers stay centered on the sculpture; there is no emitted trail.
    assert.equal(mesh.particles.length, 2 * 6 * 10);
    for (let i = 0; i < mesh.particles.length; i += 10) {
      assert.deepEqual(mesh.particles.slice(i, i + 3), [10, 6, -50]);
    }
  }
});
