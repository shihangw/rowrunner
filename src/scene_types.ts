import type {Object3D} from 'three';
import type {z} from 'zod';
import type {
  CameraModeSchema,
  RoadEffectSchema,
  SpeedScaleSchema,
  Vec3Schema,
  ColorSchema,
  PaletteSchema,
  PresetMetadataSchema,
  SkyDefinitionSchema,
  WorldPathSchema,
  SceneDefinitionSchema,
  ProtagonistDefinitionSchema,
  SceneOptionsSchema,
  WorldPluginSchema,
  RunnerPluginSchema,
} from './scene_configuration_schemas.js';

/** IDs are application-defined; no content is bundled. */
export type ScenePresetId = string;
export type MascotPresetId = string;
export type ProtagonistPresetId = string;
export type CameraMode = z.infer<typeof CameraModeSchema>;
export type RoadEffect = z.infer<typeof RoadEffectSchema>;
export type SpeedScale = z.infer<typeof SpeedScaleSchema>;
export type Vec3 = z.infer<typeof Vec3Schema>;
export type Color = z.infer<typeof ColorSchema>;
export type Palette = z.infer<typeof PaletteSchema>;
export type PresetMetadata = z.infer<typeof PresetMetadataSchema>;
/** Geometry is rebuilt each frame. +Y is up; +Z points down the road. */
export interface GeometryBuilder {
  /** Smoothly interpolated per-vertex colors, without extra directional lighting. */
  gradientTriangle(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    ca: Color,
    cb: Color,
    cc: Color,
  ): void;
  /** Translucent refractive facet, sorted by depth. Default opacity .55. */
  glassTriangle(
    a: Vec3,
    b: Vec3,
    c: Vec3,
    color: Color,
    opacity?: number,
  ): void;
  /** Soft additive glow. Center and radius follow the protagonist transform when used in its draw callback. */
  particle(center: Vec3, radius: number, color: Color, opacity?: number): void;
  triangle(a: Vec3, b: Vec3, c: Vec3, color: Color, unlit?: boolean): void;
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Color, unlit?: boolean): void;
  /** x/z are the center; y is the bottom of the box. */
  box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: Color,
  ): void;
  mountain(
    x: number,
    z: number,
    width: number,
    height: number,
    color: Color,
  ): void;
  /** Enable smooth shading to blend lighting across the rounded surface. */
  ellipsoid(
    center: Vec3,
    radius: Vec3,
    color: Color,
    segments?: number,
    rings?: number,
    smooth?: boolean,
  ): void;
  ring(center: Vec3, radius: number, thickness: number, color: Color): void;
  tube(a: Vec3, b: Vec3, radius: number, color: Color): void;
  model(
    model: ModelData,
    center: Vec3,
    scale: number,
    rotation?: number,
    tint?: Color | null,
  ): void;
}
export interface ModelData {
  positions: readonly (readonly number[])[];
  faces: readonly (readonly number[])[];
  colors: readonly (readonly number[])[];
}
export interface SkyFrame {
  width: number;
  height: number;
  palette: Palette;
  time: number;
  transition: number;
  reduced: boolean;
  eye: Vec3;
  view?: Float32Array;
  fov: number;
}
export type SkyDefinition = z.infer<typeof SkyDefinitionSchema>;
export interface CameraPose {
  eye: Vec3;
  target: Vec3;
  label: string;
}
export interface PathFrame {
  localPoint(point: Vec3): Vec3;
  worldPoint(point: Vec3): Vec3;
}
export type WorldPath = z.infer<typeof WorldPathSchema>;
export interface SceneFrame {
  readonly time: number;
  /** Frame step in seconds, capped at .05; zero under reduced motion. */
  readonly delta: number;
  /** Scenery origin; held fixed during a stationary camera pass. */
  readonly distance: number;
  /** Total decorative travel, independent of camera mode. */
  readonly travelDistance: number;
  /** Smoothed display rate supplied to render(), not a confirmed count. */
  readonly rate: number;
  /** Decorative world units per second after speed scaling; zero under reduced motion. */
  readonly visualSpeed: number;
  /** Suggested scenery bounds in local Z coordinates, including the road behind the start. */
  readonly near: number;
  readonly far: number;
  readonly reduced: boolean;
  readonly palette: Palette;
  readonly centerX: (z: number) => number;
  readonly roadLight: (z: number) => Color;
  /** Convert local road coordinates into the current world frame (including orbital worlds). */
  readonly projectPoint: (point: Vec3) => Vec3;
  readonly view: Readonly<{eye: Vec3; target: Vec3; clearance: number}> | null;
}
export type DrawFunction = (
  geometry: GeometryBuilder,
  frame: SceneFrame,
) => void;
export interface PluginContext {
  readonly id: string;
  readonly kind: 'world' | 'runner';
}
export interface PluginInstance {
  /** A fresh Three.js object tree owned by this instance. Runner transforms are applied to its parent. */
  object?: Object3D;
  draw?: DrawFunction;
  update?(frame: SceneFrame): void;
  onEnter?(frame: SceneFrame): void;
  onExit?(): void;
  dispose?(): void;
}
export type PluginFactory = (context: PluginContext) => PluginInstance;
export type SceneDefinition = z.infer<typeof SceneDefinitionSchema>;
export type ProtagonistDefinition = z.infer<typeof ProtagonistDefinitionSchema>;
export interface ResolvedScene extends PresetMetadata {
  readonly caption: string;
  readonly preset?: ScenePresetId;
  readonly palette: Palette;
  readonly road: boolean;
  readonly sky?: SkyDefinition;
  readonly path?: WorldPath;
  readonly draw?: DrawFunction;
  readonly create?: PluginFactory;
}
export interface ResolvedProtagonist extends PresetMetadata {
  readonly forwardAxis: '+z' | '-z';
  readonly preset?: string;
  readonly draw?: DrawFunction;
  readonly create?: PluginFactory;
  readonly scale: number;
  readonly offset: Vec3;
  readonly bob: number;
  readonly roll: number;
}
export type SceneOptions = z.infer<typeof SceneOptionsSchema>;
export type WorldPlugin = z.infer<typeof WorldPluginSchema>;
export type RunnerPlugin = z.infer<typeof RunnerPluginSchema>;
