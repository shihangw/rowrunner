export { defineWorld, defineRunner } from './PluginDefinitions.js';
export { disposeObject3D } from './Object3DResourceDisposal.js';
export type {
  WorldPlugin,
  RunnerPlugin,
  PluginContext,
  PluginInstance,
  PluginFactory,
  SceneFrame,
  GeometryBuilder,
  DrawFunction,
} from '../SceneTypes.js';

export {
  SceneDefinitionSchema,
  ProtagonistDefinitionSchema,
  WorldPluginSchema,
  RunnerPluginSchema,
} from '../SceneConfigurationSchemas.js';
