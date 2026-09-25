import { RoadEffectSchema } from './SceneConfigurationSchemas.js';
import type { Color, Vec3, Palette, GeometryBuilder, RoadEffect } from './SceneTypes.js';
export interface RoadOptions {
  distance: number;
  front: number;
  centerX(z: number): number;
  palette: Palette;
  near?: number;
  far: number;
  effect: RoadEffect;
}
const mix = (a: Color, b: Color, t: number): Color => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scale = (color: Color, amount: number): Color => [
  color[0] * amount,
  color[1] * amount,
  color[2] * amount,
];

export function validateRoadEffect(effect: RoadEffect) {
  if (!RoadEffectSchema.safeParse(effect).success)
    throw new RangeError(`Unknown road effect: ${String(effect)}`);
  return effect;
}

// Use world distance, never camera position or wall time. The front is attached
// to the protagonist; a passed panel stays renewed across camera cuts and pauses.
export function roadSurface(palette: Palette, worldZ: number, front: number, effect: RoadEffect) {
  const isRenewalEnabled = effect === 'renewal';
  const renewalProgress = Math.max(0, Math.min(1, (front - worldZ) / 8));
  const amount = isRenewalEnabled
    ? renewalProgress * renewalProgress * (3 - 2 * renewalProgress)
    : 1;
  const dormantRoadColor: Color = [0.085, 0.09, 0.1];
  const polishedRoadColor = mix(palette.road, palette.accent, 0.12);
  return {
    amount,
    road: isRenewalEnabled ? mix(dormantRoadColor, polishedRoadColor, amount) : palette.road,
    accent: isRenewalEnabled ? mix([0.055, 0.065, 0.075], palette.accent, amount) : palette.accent,
  };
}

export function drawRoad(
  geometryBuilder: Pick<GeometryBuilder, 'quad'>,
  {
    distance: worldOriginDistance,
    front,
    centerX: roadCenterXAt,
    palette: palette,
    near = -180,
    far,
    effect,
  }: RoadOptions,
) {
  const isRenewalEnabled = effect === 'renewal';
  const surfaceColorsAt = (z: number) =>
    roadSurface(palette, worldOriginDistance + z, front, effect);
  const drawRoadStrip = (
    z: number,
    end: number,
    left: number,
    right: number,
    y: number,
    color: Color,
    unlit = false,
  ) =>
    geometryBuilder.quad(
      [roadCenterXAt(z) + left, y, z],
      [roadCenterXAt(z) + right, y, z],
      [roadCenterXAt(end) + right, y, end],
      [roadCenterXAt(end) + left, y, end],
      color,
      unlit,
    );

  // Five-unit panels are anchored in the world, including in tracking views.
  for (
    let i = Math.floor((worldOriginDistance + near) / 5);
    i < Math.ceil((worldOriginDistance + far) / 5);
    i++
  ) {
    const z = i * 5 - worldOriginDistance,
      end = z + 5;
    const surfaceColors = surfaceColorsAt(z + 2.5);
    drawRoadStrip(z, end, -7, 7, 0, surfaceColors.road);
    for (const side of [-1, 1]) {
      const edge = side * 6.8;
      drawRoadStrip(z, end, edge - 0.09, edge + 0.09, 0.025, surfaceColors.accent, true);
      geometryBuilder.quad(
        [roadCenterXAt(z) + side * 7, -0.8, z],
        [roadCenterXAt(z) + side * 7, 0, z],
        [roadCenterXAt(end) + side * 7, 0, end],
        [roadCenterXAt(end) + side * 7, -0.8, end],
        isRenewalEnabled
          ? mix([0.045, 0.05, 0.06], [0.08, 0.12, 0.16], surfaceColors.amount)
          : [0.08, 0.12, 0.16],
      );
    }
    if (isRenewalEnabled) {
      // Recessed panel borders become fine illuminated inlays after repair.
      drawRoadStrip(
        z + 0.2,
        z + 0.24,
        -4.4,
        4.4,
        0.02,
        mix([0.027, 0.031, 0.038], scale(palette.accent, 0.28), surfaceColors.amount),
        true,
      );
      for (const side of [-1, 1]) {
        drawRoadStrip(
          z + 0.3,
          end - 0.3,
          side * 3.7 - 0.035,
          side * 3.7 + 0.035,
          0.021,
          mix([0.06, 0.065, 0.075], scale(palette.accent, 0.25), surfaceColors.amount),
          true,
        );
      }
      if (surfaceColors.amount < 1) {
        // Stable wear marks, keyed to the panel rather than generated per frame.
        const offset = Math.sin(i * 12.9898) * 2.5;
        const color = mix([0.034, 0.038, 0.044], surfaceColors.road, surfaceColors.amount);
        const point = (x: number, dz: number): Vec3 => [roadCenterXAt(z + dz) + x, 0.012, z + dz];
        geometryBuilder.quad(
          point(offset - 1.8, 0.9),
          point(offset - 1.75, 1.02),
          point(offset + 0.3, 2.2),
          point(offset + 0.25, 2.08),
          color,
        );
        geometryBuilder.quad(
          point(offset + 0.25, 2.08),
          point(offset + 0.3, 2.2),
          point(offset - 0.4, 3.9),
          point(offset - 0.46, 3.84),
          color,
        );
      }
    }
  }
  for (
    let i = Math.floor((worldOriginDistance + near) / 12);
    i < Math.ceil((worldOriginDistance + far) / 12);
    i++
  ) {
    const z = i * 12 - worldOriginDistance,
      surfaceColors = surfaceColorsAt(z);
    drawRoadStrip(z, z + 0.035, -6.6, 6.6, 0.015, [0.035, 0.05, 0.065]);
    for (const side of [-1, 1]) {
      const lane = side * 4.8;
      // Painted stripes remain readable on dormant panels; renewal adds color.
      // Keep them above the sweep so passing light never covers the markings.
      const laneColor = mix(
        [0.5, 0.52, 0.54],
        palette.accent,
        surfaceColorsAt(z + 3.5).amount * 0.65,
      );
      const markerColor = mix([0.5, 0.52, 0.54], palette.accent, surfaceColors.amount);
      drawRoadStrip(z, z + 7, lane - 0.07, lane + 0.07, 0.06, laneColor, true);
      drawRoadStrip(z, z + 2, side * 6.2 - 0.06, side * 6.2 + 0.06, 0.064, markerColor, true);
    }
  }
  if (isRenewalEnabled) {
    // A continuous, non-flashing sweep: brighter at the avatar, fading aft.
    const z = front - worldOriginDistance;
    for (let i = 0; i < 12; i++) {
      const strength = (1 - i / 12) ** 2;
      const at = z - i * 0.5;
      if (at < near || at > far) continue;
      const base = surfaceColorsAt(at).road;
      drawRoadStrip(
        at - 0.5,
        at,
        -6.65,
        6.65,
        0.04,
        mix(base, palette.accent, 0.38 * strength),
        true,
      );
    }
    if (z >= near && z <= far) {
      drawRoadStrip(
        z - 0.09,
        z + 0.03,
        -6.7,
        6.7,
        0.045,
        mix(palette.accent, [1, 1, 1], 0.65),
        true,
      );
      for (const side of [-1, 1]) {
        drawRoadStrip(
          z - 4,
          z + 0.12,
          side * 6.8 - 0.16,
          side * 6.8 + 0.16,
          0.05,
          mix(palette.accent, [1, 1, 1], 0.3),
          true,
        );
      }
    }
  }
}
