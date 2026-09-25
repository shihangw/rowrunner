import type {
  SceneDefinition,
  ProtagonistDefinition,
  WorldPlugin,
  RunnerPlugin,
} from '../SceneTypes.js';
import { WorldPluginSchema, RunnerPluginSchema } from '../SceneConfigurationSchemas.js';
import { parseInput } from '../InputValidation.js';

function version(definition: { apiVersion?: 1 }) {
  if (definition?.apiVersion !== undefined && definition.apiVersion !== 1)
    throw new RangeError('Unsupported plugin API version');
}
export function defineWorld(
  definition: SceneDefinition & { kind?: 'world'; apiVersion?: 1 },
): Readonly<WorldPlugin> {
  version(definition);
  return parseInput(WorldPluginSchema, {
    ...definition,
    kind: definition?.kind === undefined ? 'world' : definition.kind,
    apiVersion: 1,
  });
}
export function defineRunner(
  definition: ProtagonistDefinition & { kind?: 'runner'; apiVersion?: 1 },
): Readonly<RunnerPlugin> {
  version(definition);
  return parseInput(RunnerPluginSchema, {
    ...definition,
    kind: definition?.kind === undefined ? 'runner' : definition.kind,
    apiVersion: 1,
  });
}
