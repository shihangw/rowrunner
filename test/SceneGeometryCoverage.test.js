import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneRange, stationaryPose, travelSpeed } from '../src/CameraController.js';
import { drawRoad } from '../src/RoadGeometry.js';
import { drawWorld, PALETTES } from './fixtures/ExampleContentFixtures.js';

test('stationary coverage includes substantial road behind every angle and scales for wide views', () => {
  for (const shot of ['approach', 'departure', 'crossing', 'diagonal', 'overlook']) {
    for (const side of [-1, 1])
      for (const rate of [80, 500, 1800]) {
        const frame = { shot, side, segmentLength: Math.max(180, travelSpeed(rate) * 6) };
        const pose = stationaryPose(frame, () => 0);
        const normal = sceneRange(pose, (58 * Math.PI) / 180, 1.6, frame.segmentLength);
        const wide = sceneRange(pose, (58 * Math.PI) / 180, 4, frame.segmentLength);
        assert.ok(normal.near <= -660 && normal.far >= 660);
        assert.ok(wide.near <= normal.near && wide.far >= normal.far);
        assert.ok(wide.near >= -3000 && wide.far <= 3000);
      }
  }
});

test('road panels, stripes, and every biome extend behind the starting position', () => {
  const near = -900,
    far = 1100;
  for (const distance of [0, 2500]) {
    let minPanel = Infinity,
      maxPanel = -Infinity,
      minStripe = Infinity;
    drawRoad(
      {
        quad(a, b, c, d) {
          if (a[1] === 0 && b[1] === 0) {
            minPanel = Math.min(minPanel, a[2]);
            maxPanel = Math.max(maxPanel, c[2]);
          }
          if (a[1] === 0.06) minStripe = Math.min(minStripe, a[2]);
        },
      },
      {
        distance,
        front: distance,
        centerX: () => 0,
        palette: PALETTES.midnight,
        near,
        far,
        effect: 'renewal',
      },
    );
    assert.ok(minPanel <= near && maxPanel >= far);
    assert.ok(minStripe <= near + 12);
    for (const [id, palette] of Object.entries(PALETTES)) {
      let behind = 0;
      const record = (z) => {
        if (z < near + 150 && z > near - 100) behind++;
      };
      const mesh = {
        box(x, y, z) {
          if (y !== -1) record(z);
        }, // Ignore common guide posts.
        model(name, position) {
          record(position[2]);
        },
        ellipsoid(position) {
          record(position[2]);
        },
        mountain(x, z) {
          record(z);
        },
        triangle(a, b, c) {
          record((a[2] + b[2] + c[2]) / 3);
        },
        quad(a, b, c, d) {
          // Ignore the broad ground plane and common light caps.
          if (
            Math.max(a[2], b[2], c[2], d[2]) - Math.min(a[2], b[2], c[2], d[2]) < 100 &&
            a[1] !== 0.8
          )
            record((a[2] + b[2] + c[2] + d[2]) / 4);
        },
      };
      drawWorld(
        mesh,
        id,
        distance,
        () => 0,
        palette,
        3,
        false,
        far,
        () => palette.accent,
        near,
      );
      assert.ok(behind > 0, `${id} has no scenery behind the start at distance ${distance}`);
    }
  }
});
