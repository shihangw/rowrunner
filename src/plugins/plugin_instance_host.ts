import type {Group} from 'three';
import type {
  PluginInstance,
  PluginFactory,
  GeometryBuilder,
  SceneFrame,
  DrawFunction,
} from '../scene_types.js';
type Definition = {id: string; create?: PluginFactory; draw?: DrawFunction};
type Instance = {source: PluginInstance; draw?: DrawFunction};
type Kind = 'world' | 'runner';
/** Own per-instance plugin state and dispose it independently from the renderer. */
export class PluginInstanceHost {
  private roots: Partial<Record<Kind, Group>>;
  private instances = new Map<Definition, Instance>();
  private active = new Map<Kind, Instance>();
  private disposed = false;
  constructor(roots: Partial<Record<Kind, Group>> = {}) {
    this.roots = roots;
    this.instances = new Map();
    this.active = new Map();
    this.disposed = false;
  }
  draw(
    kind: Kind,
    definition: Definition,
    geometry: GeometryBuilder,
    frame: SceneFrame,
  ) {
    if (this.disposed) {
      throw new Error('Plugin host is disposed');
    }
    let instance = this.instances.get(definition);
    if (instance == null) {
      const source =
        definition.create != null
          ? definition.create(Object.freeze({id: definition.id, kind}))
          : {};
      if (typeof source !== 'object' || source === null || 'then' in source) {
        throw new TypeError(
          `Plugin ${definition.id}: create must return a synchronous instance`,
        );
      }
      const draw = source.draw ?? definition.draw;
      if (draw !== undefined && typeof draw !== 'function') {
        throw new TypeError(`Plugin ${definition.id}: invalid draw hook`);
      }
      if (source.object !== undefined && source.object?.isObject3D !== true) {
        throw new TypeError(
          `Plugin ${definition.id}: object must be a THREE.Object3D`,
        );
      }
      if (draw == null && source.object == null) {
        throw new TypeError(
          `Plugin ${definition.id}: instance requires draw or object`,
        );
      }
      if (source.object?.parent != null) {
        throw new TypeError(
          `Plugin ${definition.id}: object already belongs to a scene; create or clone one per instance`,
        );
      }
      for (const hook of ['update', 'onEnter', 'onExit', 'dispose'] as const) {
        if (source[hook] !== undefined && typeof source[hook] !== 'function') {
          throw new TypeError(`Plugin ${definition.id}: invalid ${hook} hook`);
        }
      }
      instance = {source, draw};
      this.instances.set(definition, instance);
    }
    const previous = this.active.get(kind);
    if (previous !== instance) {
      this.active.delete(kind);
      previous?.source.object?.removeFromParent();
      previous?.source.onExit?.();
      if (instance.source.object != null) {
        this.roots[kind]?.add(instance.source.object);
      }
      instance.source.onEnter?.(frame);
      this.active.set(kind, instance);
    }
    instance.source.update?.(frame);
    instance.draw?.call(instance.source, geometry, frame);
  }
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const errors = [];
    for (const instance of this.active.values()) {
      try {
        instance.source.onExit?.();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const instance of this.instances.values()) {
      try {
        instance.source.object?.removeFromParent();
        instance.source.dispose?.();
      } catch (error) {
        errors.push(error);
      }
    }
    this.active.clear();
    this.instances.clear();
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Plugin disposal failed');
    }
  }
}
