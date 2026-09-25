import { random } from '../shared/DeterministicRandom.js';
export function drawNeon(
  geometryBuilder,
  worldOriginDistance,
  roadCenterXAt,
  palette,
  far,
  near,
  view,
) {
  // Reserve a fixed viewing corridor for the entire stationary pass. Cull whole
  // buildings with their attachments so foreground towers cannot hide the hero.
  const blocksView = (x, z, w, h, depth) => {
    if (!view) return false;
    const low = [x - w / 2, -1, z - depth / 2],
      high = [x + w / 2, h + 25, z + depth / 2];
    let enter = 0,
      exit = 1;
    for (let axis = 0; axis < 3; axis++) {
      low[axis] -= view.clearance;
      high[axis] += view.clearance;
      const delta = view.target[axis] - view.eye[axis];
      if (Math.abs(delta) < 1e-8) {
        if (view.eye[axis] < low[axis] || view.eye[axis] > high[axis]) return false;
      } else {
        const a = (low[axis] - view.eye[axis]) / delta,
          b = (high[axis] - view.eye[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    return enter <= exit;
  };
  const cyan = palette.accent,
    violet = [0.65, 0.3, 0.88],
    amber = [0.95, 0.57, 0.25];
  // Low service blocks frame the road; taller districts rise behind them.
  // All details use absolute block indices so they remain fixed as we travel.
  for (
    let i = Math.floor((worldOriginDistance + near) / 36);
    i < Math.ceil((worldOriginDistance + far) / 36);
    i++
  ) {
    const z = i * 36 - worldOriginDistance;
    for (const side of [-1, 1]) {
      const seed = i * 29 + side * 13,
        x = roadCenterXAt(z) + side * (21 + random(seed) * 5);
      const h = 3 + random(seed + 1) * 6,
        light = random(seed + 2) > 0.5 ? cyan : violet;
      if (blocksView(x, z, 14, h, 24)) continue;
      geometryBuilder.box(x, -0.8, z, 12, 0.7, 24, [0.065, 0.095, 0.14]);
      geometryBuilder.box(x, -0.1, z, 9, h, 16, [0.09, 0.13, 0.2]);
      geometryBuilder.box(x, h - 0.1, z, 9.6, 0.25, 16.6, [0.16, 0.22, 0.3]);
      // Luminous storefronts face inward and read from either travel direction.
      const face = x - side * 4.53;
      geometryBuilder.quad(
        [face, 0.8, z - 6],
        [face, 2.2, z - 6],
        [face, 2.2, z + 6],
        [face, 0.8, z + 6],
        light,
        true,
      );
      geometryBuilder.box(x - side * 6, -0.1, z + 10, 0.35, 6, 0.35, [0.14, 0.2, 0.28]);
      geometryBuilder.box(x - side * 6, 5.9, z + 10, 0.55, 0.3, 2, light);
      if (i % 3 === 0) geometryBuilder.model('machine_wireless', [x, h + 0.15, z], 3, side * 0.4);
      // Paved side streets and short lit seams fill the ground between districts.
      geometryBuilder.box(
        roadCenterXAt(z) + side * 57,
        -0.94,
        z + 16,
        82,
        0.08,
        5,
        [0.045, 0.07, 0.11],
      );
      geometryBuilder.box(
        roadCenterXAt(z) + side * 57,
        -0.84,
        z + 18.2,
        82,
        0.06,
        0.16,
        [0.12, 0.34, 0.4],
      );
    }
  }
  const districts = [
    { offset: 48, spread: 19, step: 60, minHeight: 25, height: 58, width: 12, depth: 20 },
    { offset: 116, spread: 32, step: 88, minHeight: 62, height: 83, width: 21, depth: 32 },
    { offset: 225, spread: 55, step: 124, minHeight: 110, height: 115, width: 30, depth: 46 },
  ];
  for (let layer = 0; layer < districts.length; layer++) {
    const district = districts[layer];
    for (
      let i = Math.floor((worldOriginDistance + near) / district.step);
      i < Math.ceil((worldOriginDistance + far) / district.step);
      i++
    ) {
      const z = i * district.step - worldOriginDistance + layer * 13;
      for (const side of [-1, 1]) {
        const seed = i * 37 + side * 17 + layer * 131;
        const x = roadCenterXAt(z) + side * (district.offset + random(seed) * district.spread);
        const h = district.minHeight + random(seed + 7) * district.height;
        const w = district.width + random(seed + 2) * 8,
          depth = district.depth;
        if (blocksView(x, z, w, h, depth)) continue;
        const light = [cyan, violet, amber][Math.floor(random(seed + 6) * 3)];
        geometryBuilder.box(x, -1, z, w, h, depth, [
          0.055 + layer * 0.012,
          0.082 + layer * 0.01,
          0.14 + layer * 0.008,
        ]);
        geometryBuilder.box(x, h - 1, z, w * 0.68, 5 + layer * 4, depth * 0.7, [0.09, 0.13, 0.2]);
        // Window ribbons wrap every face, including rear and side camera views.
        const half = w / 2 + 0.025,
          front = z - depth / 2 - 0.025,
          back = z + depth / 2 + 0.025;
        const stride = layer === 2 ? 10 : 5;
        for (let level = 3; level < h - 2; level += stride) {
          const color = light.map((v) => v * (0.35 + random(seed + level) * 0.4));
          const y = level,
            top = y + 0.28;
          geometryBuilder.quad(
            [x - half + 1, y, front],
            [x + half - 1, y, front],
            [x + half - 1, top, front],
            [x - half + 1, top, front],
            color,
            true,
          );
          geometryBuilder.quad(
            [x - half + 1, y, back],
            [x + half - 1, y, back],
            [x + half - 1, top, back],
            [x - half + 1, top, back],
            color,
            true,
          );
          for (const edge of [-1, 1])
            geometryBuilder.quad(
              [x + edge * half, y, front + 1],
              [x + edge * half, y, back - 1],
              [x + edge * half, top, back - 1],
              [x + edge * half, top, front + 1],
              color,
              true,
            );
        }
        for (const edge of [-1, 1])
          geometryBuilder.box(x + edge * w * 0.5, 0, z - side * depth * 0.5, 0.16, h, 0.16, light);
        geometryBuilder.box(x, h + 4 + layer * 4, z, 0.18, 7 + layer * 3, 0.18, [0.25, 0.4, 0.5]);
        geometryBuilder.ellipsoid([x, h + 11 + layer * 7, z], [0.35, 0.35, 0.35], light, 8, 6);
        if (layer === 0) {
          if (i % 2 === 0) geometryBuilder.model('machine_wireless', [x, h + 4, z], 5, side * 0.4);
          // Abstract neon sign panels, kept outside the open road corridor.
          const face = x - side * (w / 2 + 0.07),
            y = h * 0.48;
          geometryBuilder.quad(
            [face, y, z - 4],
            [face, y + 12, z - 4],
            [face, y + 12, z + 4],
            [face, y, z + 4],
            [0.13, 0.065, 0.23],
            true,
          );
          for (let bar = 0; bar < 3; bar++)
            geometryBuilder.quad(
              [face - side * 0.02, y + 2 + bar * 3, z - 2.8],
              [face - side * 0.02, y + 3 + bar * 3, z - 2.8],
              [face - side * 0.02, y + 3 + bar * 3, z + 2.8 - bar],
              [face - side * 0.02, y + 2 + bar * 3, z + 2.8 - bar],
              light,
              true,
            );
        }
      }
      if (layer === 1 && i % 2 === 0) {
        for (const side of [-1, 1]) {
          const x = roadCenterXAt(z) + side * 86;
          geometryBuilder.model('craft_speederA', [x, 17 + random(i) * 10, z], 5, side * 0.18);
          geometryBuilder.box(x, 16.8 + random(i) * 10, z - 7, 0.18, 0.12, 8, cyan);
        }
      }
    }
  }
}
