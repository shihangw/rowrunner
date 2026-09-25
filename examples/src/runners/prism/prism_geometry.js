export function drawPrism(geometryBuilder, time, rate, isMotionReduced) {
  // A rotating optical icosahedron around a counter-rotating crystalline core.
  const phi = (1 + Math.sqrt(5)) / 2;
  const points = [
    [-1, phi, 0],
    [1, phi, 0],
    [-1, -phi, 0],
    [1, -phi, 0],
    [0, -1, phi],
    [0, 1, phi],
    [0, -1, -phi],
    [0, 1, -phi],
    [phi, 0, -1],
    [phi, 0, 1],
    [-phi, 0, -1],
    [-phi, 0, 1],
  ];
  const faces = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const rotate = ([x, y, z], angle) => {
    const rotationCosine = Math.cos(angle);
    const rotationSine = Math.sin(angle);
    const tilt = 0.38;
    const rotatedX = x * rotationCosine - z * rotationSine;
    const rotatedZ = x * rotationSine + z * rotationCosine;
    return [
      rotatedX,
      y * Math.cos(tilt) - rotatedZ * Math.sin(tilt) + 1.5,
      y * Math.sin(tilt) + rotatedZ * Math.cos(tilt),
    ];
  };
  const vertices = points.map((point) =>
    rotate(
      point.map((v) => (v * 1.7) / Math.hypot(...point)),
      time * 0.22,
    ),
  );
  const colors = [
    [0.28, 0.79, 0.94],
    [0.56, 0.49, 0.94],
    [0.36, 0.62, 0.95],
    [0.64, 0.91, 0.92],
  ];
  const edges = new Set();
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    geometryBuilder.glassTriangle(
      ...face.map((v) => vertices[v]),
      colors[i % colors.length],
      0.76,
    );
    for (let j = 0; j < 3; j++) {
      const a = face[j];
      const b = face[(j + 1) % 3];
      const key = [a, b].sort((x, y) => x - y).join(',');
      if (edges.has(key)) {
        continue;
      }
      edges.add(key);
      geometryBuilder.tube(vertices[a], vertices[b], 0.009, [0.56, 0.88, 0.98]);
    }
  }
  const core = [
    [0, 0.68, 0],
    [0, -0.68, 0],
    [0.48, 0, 0],
    [0, 0, 0.48],
    [-0.48, 0, 0],
    [0, 0, -0.48],
  ].map((point) => rotate(point, -time * 0.45));
  for (let i = 0; i < 4; i++) {
    const a = i + 2;
    const b = ((i + 1) % 4) + 2;
    geometryBuilder.triangle(
      core[0],
      core[a],
      core[b],
      i % 2 ? [0.57, 0.62, 0.65] : [0.23, 0.59, 0.61],
      true,
    );
    geometryBuilder.triangle(
      core[1],
      core[b],
      core[a],
      i % 2 ? [0.33, 0.27, 0.57] : [0.17, 0.39, 0.59],
      true,
    );
  }
  // A soft breathing halo replaces the orbital bands. Its feathered edge
  // extends beyond the former orbit so the visible glow reaches that radius.
  const breath = isMotionReduced
    ? 0.5
    : (1 - Math.cos((time * Math.PI * 2) / 4.5)) / 2;
  geometryBuilder.particle(
    [0, 1.5, 0],
    3.1 + breath * 0.6,
    [0.3, 0.68, 1],
    0.32 + breath * 0.18,
  );
  geometryBuilder.particle(
    [0, 1.5, 0],
    1.15 + breath * 0.15,
    [0.53, 0.89, 1],
    0.13 + breath * 0.06,
  );
}
