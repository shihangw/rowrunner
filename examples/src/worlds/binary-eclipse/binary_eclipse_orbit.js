import {drawRoad} from '@shihangw/rowrunner/geometry';

// One astronomical coordinate system for the binary and its surrounding road.
export const BINARY_CENTER = Object.freeze([0, 31000, 0]);
export const ORBIT_RADIUS = 150000;
export const BLACK_HOLE_RADII = Object.freeze([24000, 16000]);
// Compress astronomical distances uniformly for the presentation. The resulting
// 3,125-unit local radius preserves normal road width and stripe/avatar speed.
export const ORBIT_TRAVEL_SCALE = 48;
export const ORBIT_LENGTH = ORBIT_RADIUS * 2 * Math.PI;
export const LOCAL_ORBIT_LENGTH = ORBIT_LENGTH / ORBIT_TRAVEL_SCALE;

export function binaryCenters() {
  return [
    [0, 1000, 40000],
    [0, -1000, -40000],
  ].map((offset) => offset.map((v, i) => v + BINARY_CENTER[i]));
}

/** Absolute world position: every local coordinate uses the same spatial scale. */
/** @returns {import('@shihangw/rowrunner/scene').Vec3} */
export function orbitPoint([x, y, z], distance) {
  const angle =
    (((distance + z) % LOCAL_ORBIT_LENGTH) * ORBIT_TRAVEL_SCALE) / ORBIT_RADIUS;
  const radius = ORBIT_RADIUS + x * ORBIT_TRAVEL_SCALE;
  return [
    BINARY_CENTER[0] + Math.cos(angle) * radius,
    BINARY_CENTER[1] + y * ORBIT_TRAVEL_SCALE,
    BINARY_CENTER[2] + Math.sin(angle) * radius,
  ];
}

/** Shared floating origin for road geometry, scenery, protagonist and cameras. */
export function createBinaryOrbit(distance, entryDistance = 0) {
  const origin = orbitPoint([0, 0, 0], distance - entryDistance);
  const worldPoint = (point) => orbitPoint(point, distance - entryDistance);
  /** @type {(point: import('@shihangw/rowrunner/scene').Vec3) => import('@shihangw/rowrunner/scene').Vec3} */
  const localPoint = (point) => {
    const p = worldPoint(point);
    return [
      (p[0] - origin[0]) / ORBIT_TRAVEL_SCALE,
      (p[1] - origin[1]) / ORBIT_TRAVEL_SCALE,
      (p[2] - origin[2]) / ORBIT_TRAVEL_SCALE,
    ];
  };
  return {
    center: BINARY_CENTER,
    radius: ORBIT_RADIUS,
    origin,
    worldPoint,
    localPoint,
  };
}

/** Generate the road around the same center as the binary, including all stripes. */
export function drawBinaryRoad(geometryBuilder, options, orbit) {
  drawRoad(
    {
      quad(a, b, c, d, color, unlit) {
        geometryBuilder.quad(
          orbit.localPoint(a),
          orbit.localPoint(b),
          orbit.localPoint(c),
          orbit.localPoint(d),
          color,
          unlit,
        );
      },
    },
    {...options, centerX: () => 0},
  );
}

export function orbitCamera(pose, stationary, completed) {
  if (stationary || completed) {
    return pose;
  }
  return {
    ...pose,
    eye: [32 + pose.eye[0] * 0.35, 8 + pose.eye[1] * 0.5, pose.eye[2] * 0.15],
    target: [0, 7, 0],
  };
}
