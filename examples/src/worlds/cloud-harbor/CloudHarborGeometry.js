import { random } from '../shared/DeterministicRandom.js';
import { platforms } from '../shared/PlatformGeometry.js';
export function drawHarbor(
  geometryBuilder,
  worldOriginDistance,
  roadCenterXAt,
  palette,
  far,
  near,
) {
  for (
    let i = Math.floor((worldOriginDistance + near) / 100);
    i < Math.ceil((worldOriginDistance + far) / 100);
    i++
  ) {
    const z = i * 100 - worldOriginDistance;
    for (const side of [-1, 1]) {
      const x = roadCenterXAt(z) + side * (60 + random(i + side) * 40),
        width = 15 + random(i) * 20;
      geometryBuilder.box(x, -9, z, width * 2, 2, width * 2, [0.18, 0.35, 0.36]);
      const tip = [x, -42, z],
        a = [x - width, -9, z - width],
        b = [x + width, -9, z - width],
        c = [x + width, -9, z + width],
        e = [x - width, -9, z + width];
      for (const [v, w] of [
        [a, b],
        [b, c],
        [c, e],
        [e, a],
      ])
        geometryBuilder.triangle(v, w, tip, [0.18, 0.27, 0.32]);
      geometryBuilder.ellipsoid(
        [x + side * 22, 9 + random(i) * 9, z + 45],
        [23, 3.5, 12],
        [0.7, 0.79, 0.8],
        12,
        7,
      );
      // Small inhabited outposts sit on the broad floating islands.
      geometryBuilder.model('hangar_smallA', [x, -7, z], 9, (side * Math.PI) / 2);
      geometryBuilder.model('machine_wireless', [x + side * 12, -7, z + 8], 7, side * 0.4);
      if (i % 3 === 0) platforms(geometryBuilder, roadCenterXAt, z, side, palette);
    }
    if (((i % 3) + 3) % 3 === 1)
      geometryBuilder.model(
        i % 2 === 0 ? 'craft_cargoA' : 'craft_cargoB',
        [roadCenterXAt(z) + 25, 11, z],
        6,
        -0.3,
      );
  }
}
