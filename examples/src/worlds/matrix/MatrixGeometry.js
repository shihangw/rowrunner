const random = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// Tiny procedural glyphs: no font textures, downloads, or per-frame text rasterization.
const GLYPHS = [
  ['111', '101', '101', '101', '111'],
  ['010', '110', '010', '010', '111'],
  ['111', '001', '111', '100', '111'],
  ['111', '001', '111', '001', '111'],
  ['101', '101', '111', '001', '001'],
  ['111', '100', '111', '001', '111'],
  ['110', '100', '111', '101', '111'],
  ['111', '001', '010', '010', '010'],
  ['111', '101', '111', '101', '111'],
  ['111', '101', '111', '001', '011'],
  ['010', '111', '010', '101', '101'],
  ['100', '111', '001', '111', '010'],
];
function glyph(geometryBuilder, x, y, z, size, index, color, sideFace = false) {
  const pattern = GLYPHS[index];
  const point = (u, v) =>
    sideFace ? [x, y + v * size, z + u * size] : [x + u * size, y + v * size, z];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 3; col++)
      if (pattern[row][col] === '1') {
        const u = col * 0.28,
          v = (4 - row) * 0.24;
        geometryBuilder.quad(
          point(u, v),
          point(u + 0.19, v),
          point(u + 0.19, v + 0.17),
          point(u, v + 0.17),
          color,
          true,
        );
      }
}
export function drawMatrix(
  geometryBuilder,
  worldOriginDistance,
  roadCenterXAt,
  palette,
  time,
  far = 660,
  roadLight = (_z) => palette.accent,
  near = -180,
) {
  // A broad grid and circuit field fill elevated and side views.
  const grid = palette.accent.map((v) => v * 0.16);
  for (
    let i = Math.floor((worldOriginDistance + near) / 12);
    i < Math.ceil((worldOriginDistance + far) / 12);
    i++
  ) {
    const z = i * 12 - worldOriginDistance;
    geometryBuilder.quad(
      [roadCenterXAt(z) - 360, -0.975, z],
      [roadCenterXAt(z) + 360, -0.975, z],
      [roadCenterXAt(z) + 360, -0.975, z + 0.07],
      [roadCenterXAt(z) - 360, -0.975, z + 0.07],
      grid,
      true,
    );
    const deckGrid = roadLight(z).map((v) => v * 0.16);
    // Recessed cross-lines sit above the deck, below the protagonist's shadow.
    geometryBuilder.quad(
      [roadCenterXAt(z) - 6.7, 0.018, z],
      [roadCenterXAt(z) + 6.7, 0.018, z],
      [roadCenterXAt(z) + 6.7, 0.018, z + 0.045],
      [roadCenterXAt(z) - 6.7, 0.018, z + 0.045],
      deckGrid,
      true,
    );
    for (let lane = -30; lane <= 30; lane++) {
      const offset = lane * 12;
      if (!lane) continue;
      geometryBuilder.quad(
        [roadCenterXAt(z) + offset, -0.974, z],
        [roadCenterXAt(z) + offset + 0.055, -0.974, z],
        [roadCenterXAt(z + 12) + offset + 0.055, -0.974, z + 12],
        [roadCenterXAt(z + 12) + offset, -0.974, z + 12],
        grid,
        true,
      );
    }
    for (const lane of [-2.3, 0, 2.3])
      geometryBuilder.quad(
        [roadCenterXAt(z) + lane, 0.018, z],
        [roadCenterXAt(z) + lane + 0.035, 0.018, z],
        [roadCenterXAt(z + 12) + lane + 0.035, 0.018, z + 12],
        [roadCenterXAt(z + 12) + lane, 0.018, z + 12],
        deckGrid,
        true,
      );
  }
  for (
    let i = Math.floor((worldOriginDistance + near) / 54);
    i < Math.ceil((worldOriginDistance + far) / 54);
    i++
  ) {
    const z = i * 54 - worldOriginDistance;
    for (const side of [-1, 1]) {
      const seed = i * 17 + side,
        x = roadCenterXAt(z) + side * (27 + random(seed) * 13);
      const height = 22 + random(seed + 4) * 30;
      geometryBuilder.box(x, -1, z, 9, height, 12, [0.012, 0.04, 0.023]);
      // Outline one edge of each dark data monolith.
      geometryBuilder.box(
        x - side * 4.52,
        -0.7,
        z - 6.04,
        0.06,
        height - 0.2,
        0.08,
        palette.accent.map((v) => v * 0.45),
      );
      geometryBuilder.box(
        x,
        height - 1,
        z,
        9,
        0.09,
        12,
        palette.accent.map((v) => v * 0.22),
      );
      for (let column = 0; column < 3; column++) {
        const streamSeed = seed * 7 + column;
        const speed = 2 + random(streamSeed) * 2.5;
        const cycle = height + 18;
        const head = height - ((time * speed + random(streamSeed + 11) * cycle) % cycle);
        for (let row = 0; row < 12; row++) {
          const y = head + row * 1.7;
          if (y < 0.2 || y > height - 2) continue;
          const index = Math.floor(random(streamSeed * 13 + row) * GLYPHS.length);
          const color =
            row === 0 ? [0.65, 1, 0.74] : palette.accent.map((v) => v * (0.85 - row * 0.058));
          glyph(geometryBuilder, x - 3.4 + column * 2.4, y, z - 6.08, 1.2, index, color);
          glyph(geometryBuilder, x - 3.4 + column * 2.4, y, z + 6.08, 1.2, index, color);
          glyph(geometryBuilder, x - side * 4.56, y, z - 4 + column * 3.5, 1.2, index, color, true);
        }
      }
      // Low server clusters and illuminated circuit branches populate the middle distance.
      const rackX = roadCenterXAt(z + 28) + side * (65 + random(seed + 21) * 30),
        rackZ = z + 28;
      for (let rack = 0; rack < 3; rack++) {
        const xx = rackX + side * rack * 6,
          hh = 5 + random(seed + rack + 40) * 9;
        geometryBuilder.box(xx, -1, rackZ, 3.8, hh, 6, [0.012, 0.035, 0.025]);
        for (let slot = 0; slot < 4; slot++) {
          const y = 0.6 + (slot * (hh - 1.2)) / 4;
          for (const face of [-1, 1])
            geometryBuilder.box(
              xx,
              y,
              rackZ + face * 3.02,
              2.8,
              0.12,
              0.06,
              palette.accent.map((v) => v * (slot === 0 ? 0.7 : 0.28)),
            );
        }
      }
      const nodeZ = z + 38,
        nodeX = roadCenterXAt(nodeZ) + side * 17,
        endX = roadCenterXAt(nodeZ) + side * 112;
      geometryBuilder.quad(
        [nodeX, -0.94, nodeZ],
        [endX, -0.94, nodeZ],
        [endX, -0.94, nodeZ + 0.22],
        [nodeX, -0.94, nodeZ + 0.22],
        grid,
        true,
      );
      geometryBuilder.quad(
        [endX, -0.94, nodeZ],
        [endX + 0.22, -0.94, nodeZ],
        [endX + 0.22, -0.94, nodeZ + 20],
        [endX, -0.94, nodeZ + 20],
        grid,
        true,
      );
      for (const xx of [nodeX, endX]) {
        geometryBuilder.box(xx, -0.96, nodeZ, 2.4, 0.16, 2.4, [0.015, 0.11, 0.052]);
        geometryBuilder.box(xx, -0.79, nodeZ, 1.1, 0.05, 1.1, palette.accent);
      }
      const packet = (time * 0.12 + random(seed + 17)) % 1;
      geometryBuilder.box(
        nodeX + (endX - nodeX) * packet,
        -0.9,
        nodeZ,
        1.8,
        0.13,
        0.5,
        [0.55, 1, 0.72],
      );
      // Freestanding code streams form curtains beside the road, leaving Bookie clear.
      const streamX = roadCenterXAt(z + 20) + side * (12 + random(seed + 2) * 5);
      const head = 23 - ((time * 3.2 + random(seed + 9) * 38) % 38);
      for (let row = 0; row < 10; row++) {
        const y = head + row * 1.8;
        if (y < 1 || y > 27) continue;
        glyph(
          geometryBuilder,
          streamX,
          y,
          z + 20,
          1.05,
          Math.floor(random(seed + row * 3) * GLYPHS.length),
          row === 0 ? [0.72, 1, 0.8] : palette.accent.map((v) => v * (0.8 - row * 0.065)),
        );
      }
    }
  }
  // Outer data skyline: tall landmarks beyond the stationary camera corridor.
  for (
    let i = Math.floor((worldOriginDistance + near) / 108);
    i < Math.ceil((worldOriginDistance + far) / 108);
    i++
  ) {
    const z = i * 108 - worldOriginDistance;
    for (const side of [-1, 1])
      for (let layer = 0; layer < 2; layer++) {
        const seed = i * 23 + side * 3 + layer * 31;
        const zz = z + layer * 45,
          x = roadCenterXAt(zz) + side * (245 + layer * 95 + random(seed) * 35);
        const height = 65 + random(seed + 5) * 95,
          width = 14 + random(seed + 8) * 13;
        geometryBuilder.box(x, -1, zz, width, height, 22, [0.008, 0.023, 0.017]);
        for (const face of [-1, 1]) {
          geometryBuilder.box(
            x - side * width * 0.45,
            0,
            zz + face * 11.04,
            0.16,
            height,
            0.1,
            palette.accent.map((v) => v * 0.23),
          );
          for (let level = 8; level < height; level += 12)
            geometryBuilder.box(
              x,
              level,
              zz + face * 11.08,
              width * 0.72,
              0.3,
              0.08,
              palette.accent.map((v) => v * 0.18),
            );
        }
        geometryBuilder.box(
          x,
          height,
          zz,
          width * 0.8,
          0.18,
          18,
          palette.accent.map((v) => v * 0.4),
        );
      }
  }
  // Multiple depths of suspended code fall through the space between structures.
  for (
    let i = Math.floor((worldOriginDistance + near) / 36);
    i < Math.ceil((worldOriginDistance + far) / 36);
    i++
  ) {
    const z = i * 36 - worldOriginDistance;
    for (const side of [-1, 1])
      for (let layer = 0; layer < 3; layer++) {
        const seed = i * 43 + side * 11 + layer * 7;
        const zz = z + random(seed) * 22,
          x = roadCenterXAt(zz) + side * (54 + layer * 66 + random(seed + 4) * 18);
        const top = 55 + layer * 28,
          cycle = top + 25;
        const head = top - ((time * (4 + random(seed + 3) * 4) + random(seed + 9) * cycle) % cycle);
        const rows = Math.abs(z) < 450 ? 9 : 4;
        for (let row = 0; row < rows; row++) {
          const y = head + row * 2.8;
          if (y < 3 || y > top) continue;
          const color =
            row === 0 ? [0.55, 0.95, 0.69] : palette.accent.map((v) => v * (0.5 - row * 0.045));
          glyph(
            geometryBuilder,
            x,
            y,
            zz,
            1.65,
            Math.floor(random(seed + row * 5) * GLYPHS.length),
            color,
          );
          // Crossed glyph planes keep curtains legible from stationary side shots.
          if (layer === 0)
            glyph(
              geometryBuilder,
              x,
              y,
              zz,
              1.65,
              Math.floor(random(seed + row * 5) * GLYPHS.length),
              color,
              true,
            );
        }
      }
  }
}
