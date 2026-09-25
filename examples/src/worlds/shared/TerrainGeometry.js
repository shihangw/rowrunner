import { random } from './DeterministicRandom.js';
import { platforms } from './PlatformGeometry.js';
function wildRidges(m, d, cx, ice, far, near) {
  // Connected terrain bands rise with distance from the road. Low foreground
  // foothills leave the deck, crystals, and satellite platforms unobstructed.
  const bands = [
    { inner: 45, outer: 105, height: 12, step: 28 },
    { inner: 110, outer: 215, height: 30, step: 48 },
    { inner: 235, outer: 425, height: 105, step: 80 },
    { inner: 450, outer: 720, height: 195, step: 112 },
  ];
  const colors = ice
    ? [
        [0.24, 0.43, 0.47],
        [0.2, 0.36, 0.42],
        [0.16, 0.28, 0.36],
        [0.12, 0.21, 0.3],
      ]
    : [
        [0.3, 0.13, 0.09],
        [0.25, 0.09, 0.068],
        [0.2, 0.062, 0.057],
        [0.15, 0.044, 0.052],
      ];
  for (let layer = 0; layer < bands.length; layer++) {
    const { inner, outer, height, step } = bands[layer];
    for (const side of [-1, 1]) {
      const section = (index) => {
        const z = index * step - d,
          seed = index * 37 + layer * 19 + side * 11;
        const peak = height * (0.56 + random(seed) * 0.44);
        const crest = 0.38 + random(seed + 4) * 0.2;
        return [
          [0, 0],
          [0.19, 0.3],
          [crest, 1],
          [0.81, 0.34],
          [1, 0],
        ].map(([across, rise]) => [
          cx(z) + side * (inner + (outer - inner) * across),
          -1 + peak * rise,
          z,
        ]);
      };
      const start = Math.floor((d + near - step) / step),
        end = Math.ceil((d + far + step) / step);
      let a = section(start);
      for (let i = start; i < end; i++) {
        const b = section(i + 1);
        for (let strip = 0; strip < 4; strip++) {
          for (const points of [
            [a[strip], b[strip], b[strip + 1]],
            [a[strip], b[strip + 1], a[strip + 1]],
          ]) {
            const summit = Math.max(...points.map((v) => v[1])) / height;
            const shade = 0.82 + random(i * 13 + strip * 7 + side + layer) * 0.22;
            const snow = ice && layer > 0 ? Math.max(0, (summit - 0.58) / 0.42) * 0.62 : 0;
            const color = colors[layer].map((v, axis) =>
              Math.min(1, v * shade * (1 - snow) + [0.68, 0.84, 0.87][axis] * snow),
            );
            m.triangle(...points, color);
          }
        }
        a = b;
      }
    }
  }
}
export function drawTerrain(
  geometryBuilder,
  worldOriginDistance,
  roadCenterXAt,
  palette,
  ice,
  far,
  near,
) {
  wildRidges(geometryBuilder, worldOriginDistance, roadCenterXAt, ice, far, near);
  for (
    let i = Math.floor((worldOriginDistance + near) / 68);
    i < Math.ceil((worldOriginDistance + far) / 68);
    i++
  ) {
    const z = i * 68 - worldOriginDistance;
    for (const side of [-1, 1]) {
      const x = roadCenterXAt(z) + side * (25 + random(i + side) * 19);
      geometryBuilder.model(
        random(i + side * 13) < 0.5 ? 'rock_largeA' : 'rock_largeB',
        [x, -3, z],
        18 + random(i) * 18,
        random(i) * 4,
        ice ? [0.55, 0.77, 0.83] : [0.26, 0.18, 0.19],
      );
      if (i % 2 === 0)
        geometryBuilder.model(
          i % 4 === 0 ? 'rock_crystalsLargeA' : 'rock_crystalsLargeB',
          [roadCenterXAt(z) + side * 15, -0.4, z + 16],
          7 + random(i + 1) * 5,
          random(i) * 3,
          ice ? [0.3, 0.88, 0.84] : [0.96, 0.34, 0.15],
        );
      if (ice && Math.abs(i % 2) === 1) {
        const px = roadCenterXAt(z) + side * 15,
          y = 7 + random(i) * 7;
        const base = [
          [px - 1.1, -0.5, z + 15],
          [px + 1.1, -0.5, z + 15],
          [px + 1.1, -0.5, z + 17],
          [px - 1.1, -0.5, z + 17],
        ];
        for (let face = 0; face < 4; face++)
          geometryBuilder.triangle(
            base[face],
            base[(face + 1) % 4],
            [px + side * 1.5, y, z + 16],
            face % 2 ? palette.accent : [0.16, 0.53, 0.65],
          );
      }
      if (!ice) {
        geometryBuilder.quad(
          [x - 3, -0.95, z - 30],
          [x + 1, -0.95, z - 30],
          [x + 5, -0.95, z + 30],
          [x + 2, -0.95, z + 30],
          [0.85, 0.19, 0.055],
          true,
        );
      }
    }
    if (i % 6 === 0) platforms(geometryBuilder, roadCenterXAt, z, 1, palette);
  }
}
