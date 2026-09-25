import test from 'node:test';
import assert from 'node:assert/strict';
import {
  binaryCenters,
  BINARY_CENTER,
  BLACK_HOLE_RADII,
  orbitPoint,
  orbitCamera,
  createBinaryOrbit,
  drawBinaryRoad,
  LOCAL_ORBIT_LENGTH,
  ORBIT_RADIUS,
  ORBIT_TRAVEL_SCALE,
} from '../examples/src/worlds/binary-eclipse/binary_eclipse_orbit.js';
import {PALETTES} from './fixtures/example_content_fixtures.js';
const separation = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

test('binary and road share one center and a closed orbit at astronomical scale', () => {
  assert.ok(BLACK_HOLE_RADII[0] >= 7 * 1000 && BLACK_HOLE_RADII[1] >= 6 * 1000);
  assert.ok(ORBIT_RADIUS >= (360 / (2 * Math.PI)) * 1000);
  const [a, b] = binaryCenters();
  assert.deepEqual(
    a.map((v, i) => (v + b[i]) / 2),
    BINARY_CENTER,
  );
  assert.deepEqual(binaryCenters(0), binaryCenters(10000));
  for (const [i, center] of binaryCenters().entries()) {
    assert.ok(
      Math.hypot(center[0] - BINARY_CENTER[0], center[2] - BINARY_CENTER[2]) +
        BLACK_HOLE_RADII[i] * 4 <
        ORBIT_RADIUS * 0.94,
    );
  }
  for (const distance of [0, 100, 10000, LOCAL_ORBIT_LENGTH * 20]) {
    const point = orbitPoint([0, 0, 0], distance);
    assert.equal(point[1], BINARY_CENTER[1]);
    assert.ok(Math.abs(separation(point, BINARY_CENTER) - ORBIT_RADIUS) < 1e-8);
    assert.ok(
      separation(point, orbitPoint([0, 0, LOCAL_ORBIT_LENGTH], distance)) <
        1e-7,
    );
  }
});

test('road panels stay fixed on the orbit across tracking and stationary origins', () => {
  for (const origin of [0, 55, 390, 10000]) {
    for (const absoluteDistance of [0, 130, 500, 10000]) {
      assert.ok(
        separation(
          orbitPoint([4, 0.06, absoluteDistance - origin], origin),
          orbitPoint([4, 0.06, 0], absoluteDistance),
        ) < 1e-7,
      );
    }
    const frame = createBinaryOrbit(origin);
    assert.ok(
      Math.abs(
        separation(frame.localPoint([-7, 0, 0]), frame.localPoint([7, 0, 0])) -
          14,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        separation(
          frame.localPoint([0, 0, 0]),
          frame.localPoint([0, 0, 0.001]),
        ) - 0.001,
      ) < 1e-8,
    );
  }
  const pose = {eye: [0, 6, -18], target: [0, 4, 10]};
  assert.ok(Math.hypot(...orbitCamera(pose, false, false).eye) < 60);
  assert.deepEqual(orbitCamera(pose, true, false), pose);
  assert.deepEqual(orbitCamera(pose, false, true), pose);
});

test('generated road curves around the binary center and retains painted stripes', () => {
  for (const distance of [0, 3600]) {
    const orbit = createBinaryOrbit(distance);
    const center = BINARY_CENTER.map(
      (v, i) => (v - orbit.origin[i]) / ORBIT_TRAVEL_SCALE,
    );
    let panels = 0;
    let stripes = 0;
    drawBinaryRoad(
      {
        quad(a, b, c, d) {
          const points = [a, b, c, d];
          assert.ok(points.flat().every(Number.isFinite));
          if (points.every((p) => Math.abs(p[1]) < 1e-8)) {
            panels++;
            for (const p of points) {
              const radial = Math.hypot(p[0] - center[0], p[2] - center[2]);
              assert.ok(
                Math.abs(
                  Math.abs(radial - ORBIT_RADIUS / ORBIT_TRAVEL_SCALE) - 7,
                ) < 1e-7,
              );
            }
          }
          if (points.every((p) => Math.abs(p[1] - 0.06) < 1e-8)) {
            stripes++;
          }
        },
      },
      {
        distance,
        front: distance,
        centerX: () => 999,
        palette: PALETTES['black-holes'],
        near: -300,
        far: 1200,
        effect: 'renewal',
      },
      orbit,
    );
    assert.ok(panels > 200 && stripes > 100);
  }
});

test('orbital viewpoint changes visibly at normal rates', () => {
  const a = orbitPoint([0, 0, 0], 0).map((v, i) => v - BINARY_CENTER[i]);
  const b = orbitPoint([0, 0, 0], 65 * 16).map((v, i) => v - BINARY_CENTER[i]);
  const angle = Math.acos(
    (a[0] * b[0] + a[2] * b[2]) / (ORBIT_RADIUS * ORBIT_RADIUS),
  );
  assert.ok(angle > 0.25 && angle < 0.45);
});

test('entering the biome resets orbital phase without resetting travel distance', () => {
  const start = createBinaryOrbit(0);
  for (const distance of [0, 7000, 55000]) {
    const arrival = createBinaryOrbit(distance, distance);
    assert.deepEqual(arrival.origin, start.origin);
    assert.deepEqual(
      arrival.worldPoint([32, 11, -3]),
      start.worldPoint([32, 11, -3]),
    );
    const later = createBinaryOrbit(distance + 250, distance);
    assert.ok(separation(later.origin, arrival.origin) > 1000);
    assert.ok(
      separation(arrival.worldPoint([0, 0, 250]), later.worldPoint([0, 0, 0])) <
        1e-7,
    );
  }
});
