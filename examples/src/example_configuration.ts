import type {SceneOptions} from '@shihangw/rowrunner/scene';
import {worlds} from './worlds/example_worlds.ts';
import {runners} from './runners/example_runners.ts';
export {worlds, runners};

export const celebrationOptions = {message: 'Congrats!'};
// All content belongs to this app. Add an import and an array entry to extend it.
export const sceneOptions: SceneOptions = {
  worlds,
  runners,
  world: 'midnight',
  runner: 'bookie',
  camera: 'cinematic',
  autoBiomes: true,
  worldSwitchIntervalSeconds: 20,
  roadEffect: 'renewal',
};
