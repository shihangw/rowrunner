import {RoadScene as CoreScene} from 'rowrunner/scene';
import {
  sceneCatalog as resolveWorlds,
  protagonistCatalog as resolveRunners,
} from '../../src/scene_configuration_catalog.js';
import {worlds} from '../../examples/src/worlds/example_worlds.ts';
const EXAMPLE_WORLDS = worlds.filter((p) => p.draw);
import {runners} from '../../examples/src/runners/example_runners.ts';
const EXAMPLE_RUNNERS = runners.filter((p) => p.draw);
export const content = [...EXAMPLE_WORLDS, ...EXAMPLE_RUNNERS];
export const sceneCatalog = (entries, available = EXAMPLE_WORLDS) =>
  resolveWorlds(entries, available);
export const protagonistCatalog = (entries, available = EXAMPLE_RUNNERS) =>
  resolveRunners(entries, available);
export class RoadScene extends CoreScene {
  constructor(canvas, options = {}) {
    super(canvas, {plugins: content, ...options});
  }
}
export {CAMERA_MODES} from 'rowrunner/scene';
export const SCENE_PRESETS = EXAMPLE_WORLDS;
export const MASCOT_PRESETS = EXAMPLE_RUNNERS;
export {CompletionCelebration} from 'rowrunner/scene';

export const PALETTES = Object.fromEntries(
  EXAMPLE_WORLDS.map((w) => [w.id, w.palette]),
);
export const drawMascot = Object.fromEntries(
  EXAMPLE_RUNNERS.map((r) => [
    r.id,
    (mesh, time, rate, reduced) => r.draw(mesh, {time, rate, reduced}),
  ]),
);
export function drawWorld(
  mesh,
  id,
  distance,
  centerX,
  palette,
  time = 0,
  reduced = false,
  far = 660,
  roadLight = () => palette.accent,
  near = -180,
  view = null,
) {
  EXAMPLE_WORLDS.find((w) => w.id === id).draw(mesh, {
    distance,
    centerX,
    palette,
    time,
    reduced,
    far,
    roadLight,
    near,
    view,
  });
}
