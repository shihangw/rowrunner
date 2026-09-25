import type {WorldPlugin, RunnerPlugin} from '../scene_types.js';
type Plugin = WorldPlugin | RunnerPlugin;
import {defineWorld, defineRunner} from './plugin_definitions.js';

/** No global or bundled content: every visualization owns its definitions. */
export function createPluginRegistry(plugins: readonly Plugin[] = []) {
  if (!Array.isArray(plugins)) {
    throw new TypeError('plugins must be an array');
  }
  const inputs = {
    world: new Map<string, Plugin>(),
    runner: new Map<string, Plugin>(),
  };
  for (const input of plugins as readonly Plugin[]) {
    if (input == null || !['world', 'runner'].includes(input.kind)) {
      throw new TypeError(
        'Use defineWorld() or defineRunner() to declare a plugin',
      );
    }
    const list = inputs[input.kind];
    if (list.has(input.id)) {
      throw new RangeError(`Duplicate ${input.kind} plugin: ${input.id}`);
    }
    list.set(input.id, input);
  }
  function resolveAll(kind: 'world' | 'runner'): readonly Plugin[] {
    const resolved = new Map<string, Plugin>();
    const visiting = new Set<string>();
    const source = inputs[kind];
    function resolve(id: string): Plugin {
      if (resolved.has(id)) {
        return resolved.get(id)!;
      }
      if (visiting.has(id)) {
        throw new RangeError(`Circular ${kind} preset: ${id}`);
      }
      const input = source.get(id);
      if (input == null) {
        throw new RangeError(`Unknown ${kind} preset: ${id}`);
      }
      visiting.add(id);
      const plugin =
        input.kind === 'world' ? defineWorld(input) : defineRunner(input);
      const base: Partial<WorldPlugin & Omit<RunnerPlugin, 'kind'>> =
        plugin.preset != null && plugin.preset !== ''
          ? (resolve(plugin.preset) as WorldPlugin)
          : {};
      const value = Object.freeze({
        ...base,
        ...plugin,
        draw: plugin.draw ?? (plugin.create != null ? undefined : base.draw),
        create:
          plugin.create ?? (plugin.draw != null ? undefined : base.create),
        ...(plugin.kind === 'world'
          ? {palette: Object.freeze({...base.palette, ...plugin.palette})}
          : {}),
      });
      visiting.delete(id);
      resolved.set(id, value);
      return value;
    }
    return Object.freeze([...source.keys()].map(resolve));
  }
  return {
    worlds: resolveAll('world') as readonly WorldPlugin[],
    runners: resolveAll('runner') as readonly RunnerPlugin[],
  };
}
