const random = (seed) => {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Bounded, deterministic particle lifetimes: no frame-dependent spawning or backlog. */
export function drawExhaust(geometryBuilder, time, rate, still, origin, direction, cool = false) {
  if (still || rate <= 1) return;
  const power = Math.min(rate / 1500, 1);
  const intensity = Math.min(rate / 80, 1);
  const length = 1.2 + power * 5.8;
  const hot = cool ? [0.65, 1, 0.95] : [1, 0.85, 0.42];
  const ember = cool ? [0.06, 0.45, 0.7] : [1, 0.16, 0.025];
  for (let i = 0; i < 66; i++) {
    const seed = i + (origin[0] < 0 ? 91 : 317);
    const spark = i >= 48;
    const lifetime = 0.28 + random(seed + 1) * 0.42;
    const clock = time / lifetime + random(seed + 2);
    const cycle = Math.floor(clock),
      age = clock - cycle;
    // Jitter changes only when this particle is reborn, never between frames.
    const angle = random(seed + cycle * 173) * Math.PI * 2;
    const spread = (0.025 + age * (spark ? 0.65 : 0.2)) * (0.65 + power * 0.35);
    const travel = age * length * (0.65 + random(seed + 3) * 0.35) * (spark ? 1.4 : 1);
    const center = [
      origin[0] + Math.cos(angle) * spread,
      origin[1] + Math.sin(angle) * spread + age * age * (spark ? 0.32 : 0.08),
      origin[2] + direction * (0.1 + travel),
    ];
    const envelope = Math.min(1, age / 0.08) * (1 - age) ** 1.4;
    const radius = spark
      ? 0.025 + random(seed + 4) * 0.028
      : (0.11 + random(seed + 4) * 0.1) * (1 - age * 0.65);
    const opacity = envelope * intensity * (spark ? 0.85 : 0.4);
    geometryBuilder.particle(center, radius, mix(hot, ember, age), opacity);
  }
}
