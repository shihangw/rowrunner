export function platforms(m, cx, z, side, p) {
  const x = cx(z) + side * 30;
  m.box(x, -4, z, 22, 2, 24, [0.11, 0.18, 0.23]);
  m.box(x, -2.1, z, 22, 0.15, 24, p.accent);
  m.box(x, -1.95, z, 21.6, 0.2, 23.6, [0.2, 0.29, 0.32]);
  m.model('satelliteDish_detailed', [x, -1.75, z], 8, side * 0.65);
  m.model(
    'machine_generatorLarge',
    [x + side * 7, -1.75, z + 6],
    4,
    side * 0.3,
  );
}
