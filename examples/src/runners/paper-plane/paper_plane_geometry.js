const cream = [0.96, 0.93, 0.81];
export function drawPaperPlane(geometryBuilder) {
  const nose = [0, 0.12, 3.1];
  const fold = [0, 0.55, -1.2];
  const keel = [0, -0.55, -0.9];
  for (const side of [-1, 1]) {
    const wing = [side * 2.25, 0.25, -1.5];
    const inner = [side * 0.45, 0, -0.8];
    geometryBuilder.triangle(nose, wing, inner, cream, true);
    geometryBuilder.triangle(nose, inner, fold, [0.84, 0.87, 0.86]);
    geometryBuilder.triangle(nose, keel, inner, [0.93, 0.47, 0.32]);
    geometryBuilder.tube(nose, wing, 0.016, [0.71, 0.73, 0.68]);
  }
}
