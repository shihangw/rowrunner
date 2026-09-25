import type {SceneDefinition} from '@shihangw/rowrunner/scene';
import type {WorldPlugin} from '@shihangw/rowrunner/plugins';
export function defineWorld(
  definition: Omit<SceneDefinition, 'sky'> & {
    sky?: number;
    ground?: boolean;
    guideLights?: boolean;
  },
): Readonly<WorldPlugin>;
