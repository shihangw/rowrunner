import { CameraModeSchema, SpeedScaleSchema } from './SceneConfigurationSchemas.js';
import type { CameraMode, CameraPose, SpeedScale, Vec3 } from './SceneTypes.js';
export interface StationaryFrame {
  worldDistance: number;
  protagonistZ: number;
  segmentLength: number;
  side: number;
  shot: string;
}
export const CAMERA_MODES: readonly CameraMode[] = Object.freeze(CameraModeSchema.options);
const trackingCameraPoses: CameraPose[] = [
  { eye: [0, 6.2, -18], target: [0, 3.8, 10], label: 'Chase' },
  { eye: [-10, 6.0, -15], target: [0, 3.7, 2], label: 'Port tracking' },
  { eye: [8, 5.2, -14], target: [0, 3.7, 1], label: 'Starboard tracking' },
  { eye: [0, 13, -18], target: [0, 2.8, 5], label: 'Elevated chase' },
];
export function validateCamera(mode: CameraMode) {
  if (!CameraModeSchema.safeParse(mode).success)
    throw new RangeError(`Unknown camera mode: ${String(mode)}`);
  return mode;
}
/** Fixed tracking poses; cinematic sequencing is owned by each scene's director. */
export function cameraPose(time: number, mode: CameraMode = 'cinematic'): CameraPose {
  validateCamera(mode);
  if (mode === 'approach') return { eye: [1.5, 5.7, 16], target: [0, 3.5, -1], label: 'Approach' };
  if (mode === 'stationary')
    return { eye: [18, 23, 45], target: [0, 3.2, 10], label: 'Stationary · pass-by' };
  return trackingCameraPoses[{ cinematic: 1, chase: 0, side: 1, aerial: 3 }[mode]];
}

export function validateSpeedScale(scale: SpeedScale) {
  if (!SpeedScaleSchema.safeParse(scale).success)
    throw new RangeError(`Unknown speed scale: ${String(scale)}`);
  return scale;
}

/** Shared visual velocity for road scrolling and protagonist travel. */
export function travelSpeed(processingRate: number, speedScale: SpeedScale = 'logarithmic') {
  if (!Number.isFinite(processingRate) || processingRate <= 0) return 0;
  // Make 80/s a fast cruise, then compress higher throughput into controlled boosts.
  return speedScale === 'linear'
    ? processingRate * 0.075
    : 40 * (Math.log1p(processingRate / 5) / Math.log(17));
}
const MINIMUM_STATIONARY_SHOT_DURATION_SECONDS = 6;
const STATIONARY_SHOTS = ['approach', 'departure', 'crossing', 'diagonal', 'overlook'];

/** A fixed viewpoint over a real road segment, without a separate animation speed. */
export class StationaryCameraPass {
  private readonly random: () => number;
  startDistance: number;
  worldDistance: number;
  distance: number;
  elapsed: number;
  segmentLength: number | null;
  side!: number;
  shot!: string;
  private remainingShots: string[] = [];
  constructor(distance = 0, random = Math.random) {
    this.random = random;
    this.chooseShot();
    this.startDistance = distance;
    this.worldDistance = distance + 55;
    this.distance = distance;
    this.elapsed = 0;
    this.segmentLength = null;
  }
  chooseShot() {
    this.side = this.random() < 0.5 ? -1 : 1;
    // A random deck guarantees variety, with no repeated angle across deck boundaries.
    if (!this.remainingShots?.length) this.remainingShots = [...STATIONARY_SHOTS];
    const choices = this.remainingShots.filter((shot) => shot !== this.shot);
    this.shot = choices[Math.floor(this.random() * choices.length)];
    this.remainingShots.splice(this.remainingShots.indexOf(this.shot), 1);
  }
  advance(
    processingRate: number,
    deltaSeconds: number,
    distance: number,
    visualSpeed = travelSpeed(processingRate),
    shouldAdvanceAutomatically = true,
  ) {
    if (this.segmentLength === null && processingRate > 0) {
      this.segmentLength = Math.max(180, visualSpeed * MINIMUM_STATIONARY_SHOT_DURATION_SECONDS);
    }
    this.distance = distance;
    if (processingRate > 0) this.elapsed += deltaSeconds;
    const hasFinishedPass =
      this.segmentLength !== null &&
      this.elapsed >= MINIMUM_STATIONARY_SHOT_DURATION_SECONDS &&
      distance - this.startDistance >= this.segmentLength;
    if (hasFinishedPass && shouldAdvanceAutomatically) {
      this.startDistance = distance;
      this.worldDistance = distance + 55;
      this.segmentLength = Math.max(180, visualSpeed * MINIMUM_STATIONARY_SHOT_DURATION_SECONDS);
      this.elapsed = 0;
      this.chooseShot();
    }
    return hasFinishedPass;
  }
  get frame(): StationaryFrame {
    return {
      worldDistance: this.worldDistance,
      protagonistZ: this.distance - this.worldDistance,
      segmentLength: this.segmentLength ?? 180,
      side: this.side,
      shot: this.shot,
    };
  }
}

export const CINEMATIC_SHOTS = Object.freeze([
  'chase',
  'side',
  'starboard',
  'aerial',
  'approach',
  ...STATIONARY_SHOTS.map((shot) => `stationary-${shot}`),
]);
const trackingPose = (id: string): CameraPose =>
  id === 'starboard' ? trackingCameraPoses[2] : cameraPose(0, id as CameraMode);

/** Opens with side tracking, then visits every view in a shuffled round robin. */
export class CinematicCameraDirector {
  private readonly random: () => number;
  private remaining: string[];
  shot!: string;
  pass: StationaryCameraPass | null = null;
  private from: CameraPose | null = null;
  private elapsed = 0;
  constructor(distance = 0, random = Math.random) {
    this.random = random;
    this.remaining = [];
    this.next(distance);
  }
  next(distance: number, velocity = 0) {
    const previous = this.shot;
    const previousPose = previous && !this.pass ? trackingPose(previous) : null;
    if (!this.remaining.length) {
      this.remaining = [...CINEMATIC_SHOTS];
      for (let i = this.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
      }
      if (!previous) {
        const side = this.remaining.indexOf('side');
        [this.remaining[0], this.remaining[side]] = [this.remaining[side], this.remaining[0]];
      } else if (this.remaining[0] === previous) {
        const j = 1 + Math.floor(this.random() * (this.remaining.length - 1));
        [this.remaining[0], this.remaining[j]] = [this.remaining[j], this.remaining[0]];
      }
    }
    this.shot = this.remaining.shift()!;
    this.rebase(distance);
    if (this.pass && velocity > 0)
      this.pass.segmentLength = Math.max(180, velocity * MINIMUM_STATIONARY_SHOT_DURATION_SECONDS);
    this.from = this.pass ? null : previousPose;
  }
  rebase(distance: number) {
    this.elapsed = 0;
    this.from = null;
    this.pass = null;
    if (this.shot.startsWith('stationary-')) {
      this.pass = new StationaryCameraPass(distance, this.random);
      this.pass.shot = this.shot.slice('stationary-'.length);
    }
  }
  advance(
    processingRate: number,
    deltaSeconds: number,
    distance: number,
    visualSpeed = travelSpeed(processingRate),
    shouldAdvanceAutomatically = true,
  ) {
    if (processingRate <= 0) return false;
    this.elapsed += deltaSeconds;
    const hasFinishedPass = this.pass
      ? this.pass.advance(processingRate, deltaSeconds, distance, visualSpeed, false)
      : this.elapsed >= 16;
    if (hasFinishedPass && shouldAdvanceAutomatically) this.next(distance, visualSpeed);
    return hasFinishedPass;
  }
  pose(): CameraPose {
    const to = trackingPose(this.shot);
    if (!this.from || this.elapsed >= 4) return to;
    const t = Math.min(1, this.elapsed / 4),
      blend = t * t * (3 - 2 * t),
      from = this.from;
    const target = from.target.map((v, i) => v + (to.target[i] - v) * blend) as unknown as Vec3;
    // Orbit between front and rear views rather than passing through the hero.
    const offset = (p: CameraPose) => p.eye.map((v, i) => v - p.target[i]);
    const a = offset(from),
      b = offset(to);
    const yawA = Math.atan2(a[0], a[2]),
      yawB = Math.atan2(b[0], b[2]);
    const turn = Math.atan2(Math.sin(yawB - yawA), Math.cos(yawB - yawA));
    const yaw = yawA + turn * blend,
      radius = Math.hypot(a[0], a[2]) * (1 - blend) + Math.hypot(b[0], b[2]) * blend;
    return {
      eye: [
        target[0] + Math.sin(yaw) * radius,
        target[1] + a[1] * (1 - blend) + b[1] * blend,
        target[2] + Math.cos(yaw) * radius,
      ],
      target,
      label: `${from.label} → ${to.label}`,
    };
  }
}

/** Different fixed compositions over the same physical road segment. */
export function stationaryPose(frame: StationaryFrame, centerX: (z: number) => number): CameraPose {
  const length = frame.segmentLength;
  const shot = frame.shot ?? 'approach';
  const compositions = {
    approach: {
      eye: 0.9,
      target: 0.45,
      offset: 18,
      height: 23 + length * 0.025,
      label: 'approach',
    },
    departure: {
      eye: 0.08,
      target: 0.6,
      offset: 18,
      height: 23 + length * 0.025,
      label: 'departure',
    },
    crossing: {
      eye: 0.5,
      target: 0.5,
      offset: Math.max(42, length * 0.48),
      height: 28 + length * 0.08,
      label: 'side crossing',
    },
    diagonal: {
      eye: 0.05,
      target: 0.55,
      offset: Math.max(32, length * 0.24),
      height: 28 + length * 0.05,
      label: 'diagonal departure',
    },
    overlook: {
      eye: 0.32,
      target: 0.55,
      offset: Math.max(70, length * 0.48),
      height: 30 + length * 0.24,
      label: 'elevated diagonal',
    },
  };
  const composition = compositions[shot as keyof typeof compositions];
  const eyeZ = length * composition.eye - 55,
    targetZ = length * composition.target - 55;
  return {
    eye: [centerX(eyeZ) + frame.side * composition.offset, composition.height, eyeZ],
    target: [centerX(targetZ), 3.2, targetZ],
    label: `Stationary · ${frame.side < 0 ? 'left' : 'right'} ${composition.label}`,
  };
}

/** Keep both road ends beyond wide stationary compositions, including their rear view. */
export function sceneRange(pose: CameraPose, fov: number, aspect: number, segmentLength = 0) {
  if (!segmentLength)
    return pose.eye[2] > pose.target[2] ? { near: -660, far: 180 } : { near: -180, far: 660 };
  const distance = Math.hypot(...pose.eye.map((v, i) => v - pose.target[i]));
  const margin = Math.max(
    660,
    segmentLength * 1.2,
    distance * Math.tan(fov / 2) * Math.max(1, aspect) * 2,
  );
  return {
    near: Math.max(
      -3000,
      Math.floor(Math.min(-660, pose.eye[2] - margin, pose.target[2] - margin) / 5) * 5,
    ),
    far: Math.min(
      3000,
      Math.ceil(Math.max(660, pose.eye[2] + margin, pose.target[2] + margin) / 5) * 5,
    ),
  };
}
