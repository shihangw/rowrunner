import type {
  Object3D,
  BufferGeometry,
  Material,
  Skeleton,
  InstancedMesh,
  Texture,
} from 'three';

/** Dispose an exclusively owned object tree. Shared assets belong to their owner. */
export function disposeObject3D(object: Object3D): void {
  const resources = new Set<{dispose(): void}>();
  const texture = (value: unknown): value is Texture =>
    !!value &&
    typeof value === 'object' &&
    'isTexture' in value &&
    value.isTexture === true;
  object.traverse((child) => {
    const node = child as Object3D & {
      isInstancedMesh?: boolean;
      geometry?: BufferGeometry;
      skeleton?: Skeleton;
      material?: Material | Material[];
    };
    if (node.isInstancedMesh) {
      resources.add(node as InstancedMesh);
    }
    if (node.geometry) {
      resources.add(node.geometry);
    }
    if (node.skeleton) {
      resources.add(node.skeleton);
    }
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material]) {
      if (!material) {
        continue;
      }
      resources.add(material);
      for (const value of Object.values(material)) {
        if (texture(value)) {
          resources.add(value);
        }
      }
      const uniforms = (
        material as Material & {uniforms?: Record<string, {value: unknown}>}
      ).uniforms;
      for (const uniform of Object.values(uniforms ?? {})) {
        for (const value of Array.isArray(uniform.value)
          ? uniform.value
          : [uniform.value]) {
          if (texture(value)) {
            resources.add(value);
          }
        }
      }
    }
  });
  object.removeFromParent();
  const errors: unknown[] = [];
  for (const resource of resources) {
    try {
      resource.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, 'Object disposal failed');
  }
}
