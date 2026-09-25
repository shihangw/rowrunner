import {z} from 'zod';
import type {
  DrawFunction,
  PluginFactory,
  SkyFrame,
  PathFrame,
  CameraPose,
} from './scene_types.js';
import type {Texture} from 'three';

export const CameraModeSchema = z.enum([
  'cinematic',
  'chase',
  'approach',
  'side',
  'aerial',
  'stationary',
]);
export const RoadEffectSchema = z.enum(['none', 'renewal']);
export const SpeedScaleSchema = z.enum(['logarithmic', 'linear']);
export const Vec3Schema = z
  .tuple([z.number(), z.number(), z.number()])
  .readonly();
const rgb = z.number().min(0).max(1);
export const ColorSchema = z.tuple([rgb, rgb, rgb]).readonly();
export const PaletteSchema = z
  .strictObject({
    sky: ColorSchema,
    horizon: ColorSchema,
    road: ColorSchema,
    accent: ColorSchema,
    ground: ColorSchema,
  })
  .readonly();
export const PaletteOverridesSchema = PaletteSchema.unwrap()
  .partial()
  .readonly();
export const DefinitionIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const PresetMetadataSchema = z
  .object({
    id: DefinitionIdSchema,
    name: z.string(),
    description: z.string(),
  })
  .readonly();

// Validate callbacks without wrapping or invoking them; keep identity and the hot render loop intact.
const callback = <T>(name: string) =>
  z.custom<T>(
    (value) => typeof value === 'function',
    `${name} must be a function`,
  );
export const SkyDefinitionSchema = z
  .object({
    /** GLSL fragment shader, using the fullscreen uv varying. */
    fragment: z.string(),
    uniforms:
      callback<
        (
          frame: SkyFrame,
        ) => Record<string, number | readonly number[] | Texture>
      >('uniforms').optional(),
  })
  .readonly();
export const WorldPathSchema = z
  .object({
    createFrame:
      callback<(distance: number, entryDistance: number) => PathFrame>(
        'createFrame',
      ),
    camera:
      callback<
        (
          pose: CameraPose,
          stationary: boolean,
          completed: boolean,
        ) => CameraPose
      >('camera').optional(),
    introDuration: z.number().nonnegative().optional(),
    introHorizontalFov: z.number().gt(0).lt(180).optional(),
    minRange: z.number().nonnegative().optional(),
    fogDistance: z.number().nonnegative().optional(),
  })
  .readonly();
const definition = {
  id: DefinitionIdSchema,
  name: z.string().optional(),
  description: z.string().optional(),
  /** ID of another supplied definition to inherit. */
  preset: z.string().optional(),
  draw: callback<DrawFunction>('draw').optional(),
  /** Called lazily once per scene instance. Must return synchronously. */
  create: callback<PluginFactory>('create').optional(),
};
export const SceneDefinitionSchema = z.object({
  ...definition,
  caption: z.string().optional(),
  palette: PaletteOverridesSchema.optional(),
  sky: SkyDefinitionSchema.optional(),
  path: WorldPathSchema.optional(),
  /** Show the built-in road and contact shadow. Default true. */
  road: z.boolean().optional(),
});
export const ProtagonistDefinitionSchema = z.object({
  ...definition,
  /** Authored front of the mesh; default -z. */
  forwardAxis: z.enum(['+z', '-z']).optional(),
  /** Uniform positive scale; default 1. */
  scale: z.number().positive().optional(),
  /** Position in world coordinates; default [0, 2.2, -1]. */
  offset: Vec3Schema.optional(),
  /** Hover amplitude; default .12. */
  bob: z.number().nonnegative().optional(),
  /** Roll amplitude in radians; default .04. */
  roll: z.number().nonnegative().optional(),
});
const hasImplementation = (value: z.infer<typeof SceneDefinitionSchema>) =>
  (value.preset != null && value.preset !== '') ||
  value.draw != null ||
  value.create != null;
const implementationMessage = 'Plugin requires draw, create, or a preset';
export const WorldPluginSchema = SceneDefinitionSchema.extend({
  kind: z.literal('world'),
  apiVersion: z.literal(1),
})
  .refine(hasImplementation, implementationMessage)
  .readonly();
export const RunnerPluginSchema = ProtagonistDefinitionSchema.extend({
  kind: z.literal('runner'),
  apiVersion: z.literal(1),
})
  .refine(hasImplementation, implementationMessage)
  .readonly();
const worlds = z
  .array(
    z.union([
      z.string(),
      WorldPluginSchema,
      SceneDefinitionSchema.extend({
        kind: z.never().optional(),
        apiVersion: z.never().optional(),
      }),
    ]),
  )
  .nonempty()
  .readonly();
const runners = z
  .array(
    z.union([
      z.string(),
      RunnerPluginSchema,
      ProtagonistDefinitionSchema.extend({
        kind: z.never().optional(),
        apiVersion: z.never().optional(),
      }),
    ]),
  )
  .nonempty()
  .readonly();
export const SceneOptionsSchema = z.object({
  /** No bundled content: supply definitions or register plugins for this instance. */
  plugins: z
    .array(z.union([WorldPluginSchema, RunnerPluginSchema]))
    .readonly()
    .optional(),
  world: z.string().optional(),
  runner: z.string().optional(),
  worlds: worlds.optional(),
  runners: runners.optional(),
  scene: z.string().optional(),
  protagonist: z.string().optional(),
  mascot: z.string().optional(),
  scenes: worlds.optional(),
  protagonists: runners.optional(),
  camera: CameraModeSchema.optional(),
  autoBiomes: z.boolean().optional(),
  worldSwitchIntervalSeconds: z.number().finite().positive().optional(),
  roadEffect: RoadEffectSchema.optional(),
  speedScale: SpeedScaleSchema.optional(),
});
