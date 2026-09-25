// Geometry authored for this package. Bookie is modeled from the supplied reference.
import {drawExhaust} from '../shared/exhaust_particles.js';
const ink = [0.055, 0.085, 0.105];
const gold = [0.81, 0.66, 0.4];
const cream = [0.96, 0.93, 0.81];
const navy = [0.1, 0.18, 0.29];

export function drawBookie(geometryBuilder, time, rate, isMotionReduced) {
  // Closed book: dark covers, cream page block, spine, and individual page lines.
  geometryBuilder.box(0, 0, 0, 3.1, 0.15, 2.15, ink);
  geometryBuilder.box(0, 0.15, 0, 2.96, 0.55, 2.03, navy);
  geometryBuilder.box(0.11, 0.23, -0.03, 2.61, 0.39, 1.99, cream);
  geometryBuilder.box(-1.37, 0.14, 0, 0.24, 0.57, 2.03, navy);
  geometryBuilder.box(0, 0.68, 0, 3.1, 0.16, 2.15, navy);
  geometryBuilder.box(0, 0.84, 0, 2.9, 0.035, 1.95, [0.16, 0.25, 0.36]);
  for (const y of [0.32, 0.43, 0.54]) {
    geometryBuilder.box(
      0.15,
      y,
      -1.035,
      2.52,
      0.018,
      0.018,
      [0.55, 0.59, 0.61],
    );
  }
  // Body and round charcoal head.
  geometryBuilder.ellipsoid(
    [0, 1.2, 0.1],
    [0.67, 0.59, 0.58],
    [0.23, 0.28, 0.31],
    40,
    28,
    true,
  );
  geometryBuilder.ellipsoid(
    [0, 2.22, 0],
    [1.13, 1.13, 1.13],
    [0.32, 0.37, 0.4],
    64,
    40,
    true,
  );
  // Antennae, bent outward, with gold tips and a small glint.
  for (const side of [-1, 1]) {
    const sway = isMotionReduced
      ? 0
      : Math.sin(time * 2.5 + side) * 0.045 * Math.min(1, rate / 500);
    const points = [
      [side * 0.56, 3.06, 0.02],
      [side * 0.61, 3.43, 0.02],
      [side * (0.8 + sway), 3.72, 0.04],
      [side * (0.98 + sway), 3.82, 0.05],
    ];
    for (let i = 1; i < points.length; i++) {
      geometryBuilder.tube(points[i - 1], points[i], 0.065, ink);
    }
    geometryBuilder.ellipsoid(points[3], [0.18, 0.18, 0.15], ink);
    geometryBuilder.ellipsoid(
      [points[3][0], 3.82, -0.035],
      [0.14, 0.14, 0.12],
      gold,
    );
    geometryBuilder.ellipsoid(
      [points[3][0] - 0.035, 3.865, -0.145],
      [0.045, 0.045, 0.025],
      cream,
      8,
      6,
    );
  }
  // Round spectacles sit on the authored front of the head (-Z).
  // Follow the deeper spherical surface without changing the face's proportions.
  const facePoint = ([x, y, z]) => [x, y, (z * 1.13) / 0.79];
  for (const side of [-1, 1]) {
    const x = side * 0.49;
    geometryBuilder.ellipsoid(
      facePoint([side * 0.68, 1.91, -0.62]),
      [0.18, 0.085, 0.045],
      gold,
    );
    geometryBuilder.ellipsoid(
      facePoint([x, 2.31, -0.74]),
      [0.4, 0.4, 0.15],
      cream,
      24,
      12,
    );
    geometryBuilder.ellipsoid(
      facePoint([x + side * 0.02, 2.3, -0.873]),
      [0.26, 0.285, 0.075],
      [0.36, 0.31, 0.21],
      20,
      12,
    );
    geometryBuilder.ellipsoid(
      facePoint([x + side * 0.02, 2.29, -0.939]),
      [0.145, 0.18, 0.025],
      [0.19, 0.18, 0.14],
      16,
      10,
    );
    geometryBuilder.ellipsoid(
      facePoint([x - 0.075, 2.42, -0.967]),
      [0.068, 0.075, 0.02],
      [1, 1, 0.95],
      10,
      8,
    );
    geometryBuilder.ellipsoid(
      facePoint([x + 0.07, 2.29, -0.964]),
      [0.031, 0.036, 0.018],
      [0.8, 0.73, 0.51],
      8,
      6,
    );
    geometryBuilder.ring(facePoint([x, 2.31, -0.82]), 0.43, 0.06, ink);
    geometryBuilder.tube(
      facePoint([side * 0.1, 2.32, -0.8]),
      facePoint([side * 0.02, 2.34, -0.81]),
      0.035,
      ink,
    );
    geometryBuilder.tube(
      facePoint([side * 0.9, 2.32, -0.72]),
      facePoint([side * 1.1, 2.22, -0.39]),
      0.04,
      ink,
    );
    geometryBuilder.tube(
      facePoint([side * 0.47, 2.88, -0.64]),
      facePoint([side * 0.63, 2.92, -0.6]),
      0.035,
      ink,
    );
  }
  // A small smile and gold bow tie.
  const smile = [
    [-0.16, 1.96, -0.78],
    [-0.08, 1.9, -0.795],
    [0.02, 1.89, -0.8],
    [0.12, 1.93, -0.78],
  ];
  for (let i = 1; i < smile.length; i++) {
    geometryBuilder.tube(
      facePoint(smile[i - 1]),
      facePoint(smile[i]),
      0.026,
      ink,
    );
  }
  for (const side of [-1, 1]) {
    geometryBuilder.ellipsoid(
      [side * 0.29, 1.1, -0.6],
      [0.31, 0.23, 0.14],
      ink,
    );
    geometryBuilder.triangle(
      [side * 0.1, 1.1, -0.76],
      [side * 0.47, 1.28, -0.74],
      [side * 0.45, 0.93, -0.75],
      gold,
      true,
    );
  }
  geometryBuilder.ellipsoid([0, 1.1, -0.76], [0.13, 0.13, 0.08], gold);
  for (const side of [-1, 1]) {
    drawExhaust(
      geometryBuilder,
      time,
      rate,
      isMotionReduced,
      [side * 0.97, 0.15, 1.1],
      1,
    );
  }
}
