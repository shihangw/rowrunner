const random = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// An occasional slow glow, rather than a sequence of rapid flashes.
export function stormFlash(time, reduced = false) {
  if (reduced) {
    return 0;
  }
  const phase = ((time % 19) + 19) % 19;
  return phase > 8 && phase < 9.6
    ? Math.sin(((phase - 8) / 1.6) * Math.PI) ** 2
    : 0;
}
// Long wind-driven swells, a crossing swell, and smaller surface chop.
// Different wavelengths travel at different speeds; the second harmonic gives
// each wave a narrow crest and a broad trough without exceeding road clearance.
const WAVES = [
  [98, 0.84, 0.82, 0.57, 0.4],
  [57, 0.4, 0.94, 0.34, 2.1],
  [39, 0.23, -0.42, 0.91, 4.7],
  [23, 0.14, 0.73, 0.68, 1.3],
  [14, 0.065, 0.98, -0.2, 3.6],
].map(([length, amplitude, x, z, phase]) => {
  const k = (2 * Math.PI) / length;
  const n = Math.hypot(x, z);
  return {
    amplitude,
    kx: (k * x) / n,
    kz: (k * z) / n,
    speed: Math.sqrt(9.81 * k),
    phase,
  };
});
function seaSample(x, z, time) {
  let height = -3.8;
  let dx = 0;
  let dz = 0;
  for (const wave of WAVES) {
    const phase = x * wave.kx + z * wave.kz - time * wave.speed + wave.phase;
    const gain = wave.amplitude / 1.18;
    height += gain * (Math.sin(phase) - 0.18 * Math.cos(2 * phase));
    const slope = gain * (Math.cos(phase) + 0.36 * Math.sin(2 * phase));
    dx += slope * wave.kx;
    dz += slope * wave.kz;
  }
  return {height, dx, dz};
}
export function seaHeight(x, z, time) {
  return seaSample(x, z, time).height;
}

function waterTriangle(m, a, b, c) {
  if (m.gradientTriangle) {
    m.gradientTriangle(a.point, b.point, c.point, a.color, b.color, c.color);
  } else if (m._gradientTriangle) {
    m._gradientTriangle(a.point, b.point, c.point, a.color, b.color, c.color);
  } else {
    m.triangle(a.point, b.point, c.point, a.color, true);
  }
}
export function drawStorm(
  geometryBuilder,
  worldOriginDistance,
  roadCenterXAt,
  palette,
  time,
  isMotionReduced = false,
  far = 660,
  near = -320,
) {
  const flash = stormFlash(time, isMotionReduced);
  // The horizon sheet sits below every trough, never slicing off wave bottoms.
  geometryBuilder.quad(
    [-2400, -6, near - 1100],
    [2400, -6, near - 1100],
    [2400, -6, far + 1800],
    [-2400, -6, far + 1800],
    palette.ground,
  );
  const sample = (x, wz) => {
    const {height, dx, dz} = seaSample(x, wz, time);
    const facing = Math.max(0, Math.min(1, 0.45 + dx * 2.3 + dz * 1.4));
    const crest = Math.max(0, (height + 3.8) / 1.7);
    const glint =
      Math.pow(
        Math.max(0, 1 - Math.abs(dx - 0.075) * 6 - Math.abs(dz + 0.025) * 5),
        8,
      ) * 0.1;
    // Smooth whitecaps form on high crests. Continuous patches
    // fragment the foam without cell-aligned ribbons or threshold flicker.
    const patch =
      Math.sin(x * 0.17 + wz * 0.11 - time * 0.31) * 0.55 +
      Math.sin(x * 0.071 - wz * 0.13 + time * 0.17) * 0.45;
    const high = Math.max(0, Math.min(1, (height + 3.15) / 0.65));
    const foam =
      high *
      high *
      (3 - 2 * high) *
      Math.max(0, Math.min(1, (patch + 0.1) * 1.6)) *
      0.72;
    const base = [
      0.022 + facing * 0.055 + crest * 0.018 + glint + flash * 0.025,
      0.075 + facing * 0.12 + crest * 0.035 + glint + flash * 0.035,
      0.105 + facing * 0.16 + crest * 0.04 + glint + flash * 0.04,
    ];
    const color = base.map(
      (v, i) => v * (1 - foam) + [0.52, 0.7, 0.73][i] * foam,
    );
    return {point: [x, height, wz - worldOriginDistance], color};
  };
  const start = Math.floor((worldOriginDistance + near) / 18) * 18;
  const end = Math.ceil((worldOriginDistance + far) / 18) * 18;
  // Share vertices across adjacent cells; all phases use absolute world position.
  let row = Array.from({length: 49}, (_, i) => sample((i - 24) * 6, start));
  for (let wz = start; wz < end; wz += 6) {
    const next = Array.from({length: 49}, (_, i) =>
      sample((i - 24) * 6, wz + 6),
    );
    for (let i = 0; i < 48; i++) {
      waterTriangle(geometryBuilder, row[i], row[i + 1], next[i + 1]);
      waterTriangle(geometryBuilder, row[i], next[i + 1], next[i]);
    }
    row = next;
  }
  // Coarser offshore swells retain the same spectrum. Subdivide the inner edge
  // to match the fine mesh exactly, preventing seams along the detail boundary.
  for (const side of [-1, 1]) {
    let row = Array.from({length: 27}, (_, i) =>
      sample(side * (144 + i * 18), start),
    );
    for (let wz = start; wz < end; wz += 18) {
      const next = Array.from({length: 27}, (_, i) =>
        sample(side * (144 + i * 18), wz + 18),
      );
      for (let ix = 0; ix < 26; ix++) {
        const a = row[ix];
        const b = row[ix + 1];
        const c = next[ix + 1];
        const e = next[ix];
        waterTriangle(geometryBuilder, a, b, c);
        if (ix === 0) {
          const q = sample(side * 144, wz + 6);
          const r = sample(side * 144, wz + 12);
          waterTriangle(geometryBuilder, a, c, q);
          waterTriangle(geometryBuilder, q, c, r);
          waterTriangle(geometryBuilder, r, c, e);
        } else {
          waterTriangle(geometryBuilder, a, c, e);
        }
      }
      row = next;
    }
  }
  // Bridge supports, navigational buoys, and distant offshore rock stacks.
  for (
    let i = Math.floor((worldOriginDistance + near) / 56);
    i < Math.ceil((worldOriginDistance + far) / 56);
    i++
  ) {
    const z = i * 56 - worldOriginDistance;
    geometryBuilder.box(
      roadCenterXAt(z),
      -9,
      z,
      10.8,
      8.2,
      1.2,
      [0.055, 0.09, 0.12],
    );
    for (const side of [-1, 1]) {
      const x = roadCenterXAt(z) + side * (18 + random(i + side) * 14);
      const y = seaHeight(x, i * 56, time);
      geometryBuilder.box(x, y - 0.3, z, 1.1, 2.3, 1.1, [0.14, 0.19, 0.21]);
      geometryBuilder.box(x, y + 1.8, z, 1.12, 0.3, 1.12, [0.95, 0.52, 0.19]);
      geometryBuilder.ellipsoid(
        [x, y + 2.4, z],
        [0.2, 0.24, 0.2],
        [1, 0.69, 0.3],
        8,
        5,
      );
      for (let rock = 0; rock < 2; rock++) {
        const rz = z + rock * 19;
        const rx =
          roadCenterXAt(rz) + side * (58 + rock * 68 + random(i + rock) * 26);
        geometryBuilder.model(
          rock === 0 ? 'rock_largeA' : 'rock_largeB',
          [rx, -7, rz],
          16 + random(i * 7 + rock) * 24,
          random(i + rock) * 3,
          [0.11, 0.16, 0.2],
        );
      }
    }
  }
  // Offshore platforms and wind towers populate the horizon at several depths.
  for (
    let i = Math.floor((worldOriginDistance + near) / 112);
    i < Math.ceil((worldOriginDistance + far + 180) / 112);
    i++
  ) {
    const z = i * 112 - worldOriginDistance;
    for (const side of [-1, 1]) {
      const x = roadCenterXAt(z) + side * (80 + random(i + side) * 95);
      const height = 24 + random(i * 3 + side) * 22;
      for (const leg of [-1, 1]) {
        geometryBuilder.box(
          x + leg * 5,
          -8,
          z,
          1.1,
          12,
          1.1,
          [0.09, 0.14, 0.17],
        );
      }
      geometryBuilder.box(x, 3, z, 15, 1.1, 11, [0.11, 0.18, 0.21]);
      geometryBuilder.box(x, 4.1, z, 1.0, height, 1.0, [0.22, 0.29, 0.31]);
      geometryBuilder.ellipsoid(
        [x, height + 4, z],
        [1.0, 1.0, 0.6],
        [0.37, 0.47, 0.49],
        8,
        5,
      );
      const spin = time * 0.5 + random(i) * 6;
      for (let blade = 0; blade < 3; blade++) {
        const angle = spin + (blade * Math.PI * 2) / 3;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const radius = 10;
        geometryBuilder.triangle(
          [x - s * 0.4, height + 4 + c * 0.4, z - 0.7],
          [x + s * 0.4, height + 4 - c * 0.4, z - 0.7],
          [x + c * radius, height + 4 + s * radius, z - 0.7],
          [0.33, 0.43, 0.46],
        );
      }
      geometryBuilder.model(
        'machine_generatorLarge',
        [x + side * 4.5, 4.1, z],
        3,
        Math.PI / 2,
        [0.29, 0.38, 0.42],
      );
      geometryBuilder.model(
        i % 2 === 0 ? 'satelliteDish' : 'machine_wireless',
        [x - side * 4.5, 4.1, z],
        5,
        side * 0.6,
        [0.42, 0.56, 0.6],
      );
    }
  }
  // Wind slants rain toward +X. Keep the densest rain away from the protagonist.
  for (
    let row = Math.floor((worldOriginDistance + near) / 32);
    row < Math.ceil((worldOriginDistance + far) / 32);
    row++
  ) {
    for (let drop = 0; drop < 32; drop++) {
      const seed = row * 43 + drop;
      const z = row * 32 + random(seed + 2) * 32 - worldOriginDistance;
      const x = roadCenterXAt(z) + (random(seed * 7 + 1) - 0.5) * 480;
      const y =
        104 -
        ((time * (18 + random(seed) * 12) + random(seed + 3) * 110) % 110);
      if (y < -2 || Math.abs(x - roadCenterXAt(z)) < 6) {
        continue;
      }
      const length = 1.2 + random(seed + 17) * 1.4;
      geometryBuilder.quad(
        [x, y, z],
        [x + 0.045, y, z],
        [x + 0.65, y - length, z],
        [x + 0.605, y - length, z],
        [0.25, 0.39, 0.46],
        true,
      );
    }
  }
  if (flash > 0.025) {
    const z = 330;
    const x = roadCenterXAt(z) - 95;
    const points = [
      [x, 100, z],
      [x - 7, 82, z],
      [x + 1, 65, z],
      [x - 12, 43, z],
      [x - 7, 28, z],
      [x - 22, 8, z],
    ];
    const color = [0.48 * flash, 0.68 * flash, 0.84 * flash];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const w = 0.7;
      geometryBuilder.quad(
        [a[0] - w, a[1], z],
        [a[0] + w, a[1], z],
        [b[0] + w, b[1], z],
        [b[0] - w, b[1], z],
        color,
        true,
      );
    }
    geometryBuilder.quad(
      [x - 1, 65, z],
      [x + 1, 65, z],
      [x + 20, 45, z],
      [x + 19, 45, z],
      color,
      true,
    );
  }
}
