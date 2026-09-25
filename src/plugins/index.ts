export {defineWorld, defineRunner} from './plugin_definitions.js';
export {disposeObject3D} from './object_3d_resource_disposal.js';
export type {
  WorldPlugin,
  RunnerPlugin,
  PluginContext,
  PluginInstance,
  PluginFactory,
  SceneFrame,
  GeometryBuilder,
  DrawFunction,
} from '../scene_types.js';

export {
  SceneDefinitionSchema,
  ProtagonistDefinitionSchema,
  WorldPluginSchema,
  RunnerPluginSchema,
} from '../scene_configuration_schemas.js';
