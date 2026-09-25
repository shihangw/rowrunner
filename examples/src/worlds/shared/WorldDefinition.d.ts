import type { SceneDefinition } from 'rowrunner/scene';
import type { WorldPlugin } from 'rowrunner/plugins';
export function defineWorld(
  definition: Omit<SceneDefinition, 'sky'> & {
    sky?: number;
    ground?: boolean;
    guideLights?: boolean;
  },
): Readonly<WorldPlugin>;
