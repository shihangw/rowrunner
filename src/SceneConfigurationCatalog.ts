import type { z } from 'zod';
import type {
  Palette,
  PresetMetadata,
  SceneDefinition,
  ProtagonistDefinition,
  ResolvedScene,
  ResolvedProtagonist,
} from './SceneTypes.js';
import {
  SceneDefinitionSchema,
  ProtagonistDefinitionSchema,
  PaletteSchema,
} from './SceneConfigurationSchemas.js';
import { parseInput } from './InputValidation.js';
import { validatePreset } from './PresetValidation.js';

export const DEFAULT_PALETTE: Palette = PaletteSchema.parse({
  sky: [0.012, 0.022, 0.058],
  horizon: [0.1, 0.18, 0.23],
  road: [0.055, 0.085, 0.12],
  accent: [0.24, 0.96, 0.86],
  ground: [0.035, 0.065, 0.082],
});

// Explicit undefined has the same inheritance semantics as an omitted optional field.
function definedProperties(configuration: object | undefined): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(configuration ?? {}).filter(([, configuration]) => configuration !== undefined),
  );
}

function catalog<T extends SceneDefinition | ProtagonistDefinition, R>(
  entries: readonly (string | T)[],
  presets: readonly T[],
  kind: string,
  schema: z.ZodType<T>,
  normalize: (definition: T, preset: string | undefined, baseDefinition: T | undefined) => R,
): readonly Readonly<PresetMetadata & R>[] {
  if (!Array.isArray(entries) || !entries.length)
    throw new TypeError(`${kind} must be a nonempty array`);
  const registeredIdentifiers = new Set();
  return Object.freeze(
    Array.from(entries).map((entry) => {
      const definition = parseInput(
        schema,
        typeof entry === 'string' ? { id: entry, preset: entry } : entry,
        kind,
      );
      if (registeredIdentifiers.has(definition.id))
        throw new RangeError(`Duplicate ${kind} id: ${definition.id}`);
      registeredIdentifiers.add(definition.id);
      const preset =
        definition.preset ??
        (presets.some((p) => p.id === definition.id) ? definition.id : undefined);
      if (preset !== undefined) validatePreset(preset, presets, kind);
      if (!preset && !definition.draw && !definition.create)
        throw new TypeError(`${kind} ${definition.id} requires a preset, draw, or create function`);
      const baseDefinition = presets.find((p) => p.id === preset);
      return Object.freeze({
        id: definition.id,
        name: definition.name ?? baseDefinition?.name ?? definition.id,
        description: definition.description ?? baseDefinition?.description ?? '',
        ...normalize(definition, preset, baseDefinition),
      });
    }),
  );
}

export function sceneCatalog(
  entries?: readonly (string | SceneDefinition)[],
  available: readonly SceneDefinition[] = [],
): readonly ResolvedScene[] {
  return catalog(
    entries ?? available.map((p) => p.id),
    available,
    'scenes',
    SceneDefinitionSchema,
    (definition, preset, baseDefinition) => {
      // Validate the merged definition as well as the override. Inheritance remains application-owned.
      const merged = parseInput(SceneDefinitionSchema, {
        ...baseDefinition,
        ...definedProperties(definition),
      });
      const palette = parseInput(PaletteSchema, {
        ...DEFAULT_PALETTE,
        ...definedProperties(baseDefinition?.palette),
        ...definedProperties(definition.palette),
      });
      return {
        preset,
        palette,
        road: merged.road ?? true,
        caption: merged.caption ?? '',
        create: definition.create ?? (definition.draw ? undefined : baseDefinition?.create),
        draw: definition.draw ?? (definition.create ? undefined : baseDefinition?.draw),
        sky: merged.sky,
        path: merged.path,
      };
    },
  );
}

export function protagonistCatalog(
  entries?: readonly (string | ProtagonistDefinition)[],
  available: readonly ProtagonistDefinition[] = [],
): readonly ResolvedProtagonist[] {
  return catalog(
    entries ?? available.map((p) => p.id),
    available,
    'protagonists',
    ProtagonistDefinitionSchema,
    (definition, preset, baseDefinition) => {
      const merged = parseInput(ProtagonistDefinitionSchema, {
        ...baseDefinition,
        ...definedProperties(definition),
      });
      return {
        preset: baseDefinition?.preset ?? preset,
        draw: definition.draw ?? (definition.create ? undefined : baseDefinition?.draw),
        create: definition.create ?? (definition.draw ? undefined : baseDefinition?.create),
        forwardAxis: merged.forwardAxis ?? '-z',
        scale: merged.scale ?? 1,
        offset: merged.offset ?? Object.freeze([0, 2.2, -1] as const),
        bob: merged.bob ?? 0.12,
        roll: merged.roll ?? 0.04,
      };
    },
  );
}
