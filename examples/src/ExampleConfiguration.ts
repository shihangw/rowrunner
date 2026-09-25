import type { SceneOptions } from 'rowrunner/scene';
import { worlds } from './worlds/ExampleWorlds.ts';
import { runners } from './runners/ExampleRunners.ts';
export { worlds, runners };

export const celebrationOptions = { message: 'Congrats!' };
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
