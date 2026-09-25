import type { Palette, SkyDefinition, SkyFrame, Vec3 } from './SceneTypes.js';
type AtmosphereCameraState = { view: Float32Array; eye: Vec3; fov: number };
import * as THREE from 'three';
import * as shaders from './SceneShaderPrograms.js';

// Retain the authored palette/shader appearance while Three.js owns every GPU
// resource, render pass, camera, native object, and context restoration.
function createShaderMaterial(
  vertexShaderSource: string,
  fragmentShaderSource: string,
  options: THREE.ShaderMaterialParameters = {},
) {
  const vertexShader = vertexShaderSource
    .replace(/\battribute\b/g, 'in')
    .replace(/\bvarying\b/g, 'out');
  const fragmentShader =
    'precision highp float;\nout vec4 outputColor;\n' +
    fragmentShaderSource
      .replace(/\bvarying\b/g, 'in')
      .replace(/\bgl_FragColor\b/g, 'outputColor')
      .replace(/\btexture2D\b/g, 'texture');
  const uniforms: Record<string, THREE.IUniform<unknown>> = {};
  for (const source of [vertexShaderSource, fragmentShaderSource]) {
    for (const match of source.matchAll(/uniform\s+\w+\s+([^;]+);/g)) {
      for (const name of match[1].split(',')) uniforms[name.trim()] = { value: null };
    }
  }
  return new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    glslVersion: THREE.GLSL3,
    side: THREE.DoubleSide,
    toneMapped: false,
    ...options,
  });
}

class DynamicGeometryMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial> {
  private readonly vertexAttributeLayout: readonly (readonly [string, number])[];
  private readonly vertexStride: number;
  private vertexBuffer?: THREE.InterleavedBuffer;
  constructor(
    material: THREE.RawShaderMaterial,
    vertexAttributeLayout: readonly (readonly [string, number])[],
  ) {
    super(new THREE.BufferGeometry(), material);
    this.vertexAttributeLayout = vertexAttributeLayout;
    this.vertexStride = vertexAttributeLayout.reduce((n, [, size]) => n + size, 0);
    this.frustumCulled = false;
  }
  upload(values: readonly number[]) {
    if (!values.length) {
      this.visible = false;
      return;
    }
    this.visible = true;
    if (!this.vertexBuffer || values.length > this.vertexBuffer.array.length) {
      // Reallocate only when capacity grows, releasing the old GPU buffer.
      this.geometry.dispose();
      this.geometry = new THREE.BufferGeometry();
      const capacity =
        Math.ceil(
          Math.max(values.length, (this.vertexBuffer?.array.length ?? 0) * 1.5) / this.vertexStride,
        ) * this.vertexStride;
      this.vertexBuffer = new THREE.InterleavedBuffer(
        new Float32Array(capacity),
        this.vertexStride,
      ).setUsage(THREE.DynamicDrawUsage);
      let offset = 0;
      for (const [name, size] of this.vertexAttributeLayout) {
        this.geometry.setAttribute(
          name,
          new THREE.InterleavedBufferAttribute(this.vertexBuffer, size, offset),
        );
        offset += size;
      }
    }
    this.vertexBuffer.array.set(values);
    this.vertexBuffer.clearUpdateRanges();
    this.vertexBuffer.addUpdateRange(0, values.length);
    this.vertexBuffer.needsUpdate = true;
    this.geometry.setDrawRange(0, values.length / this.vertexStride);
  }
}

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly scene: THREE.Scene;
  readonly worldRoot: THREE.Group;
  readonly runnerRoot: THREE.Group;
  private readonly sky: THREE.RawShaderMaterial;
  private readonly skyMaterials: Map<SkyDefinition, THREE.RawShaderMaterial>;
  private readonly geometryMaterial: THREE.RawShaderMaterial;
  private readonly particleMaterial: THREE.RawShaderMaterial;
  private readonly glassMaterial: THREE.RawShaderMaterial;
  private readonly postProcessingMaterial: THREE.RawShaderMaterial;
  private readonly opaqueGeometryMesh: DynamicGeometryMesh;
  private readonly particleGeometryMesh: DynamicGeometryMesh;
  private readonly glassGeometryMesh: DynamicGeometryMesh;
  private readonly particleScene: THREE.Scene;
  private readonly glassScene: THREE.Scene;
  private readonly screenScene: THREE.Scene;
  private readonly screenCamera: THREE.Camera;
  private readonly screenQuad: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  private readonly sceneRenderTarget: THREE.WebGLRenderTarget;
  private backdropTexture: THREE.FramebufferTexture;
  private readonly fogColor: THREE.Color;
  private viewportWidth = 0;
  private viewportHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.info.autoReset = false;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.matrixAutoUpdate = false;
    this.scene = new THREE.Scene();
    this.worldRoot = new THREE.Group();
    this.runnerRoot = new THREE.Group();
    this.runnerRoot.matrixAutoUpdate = false;
    this.scene.add(this.worldRoot, this.runnerRoot);
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(-30, 70, -40);
    this.scene.add(new THREE.HemisphereLight(0xd7edff, 0x263446, 2), sun);

    this.sky = createShaderMaterial(shaders.skyVertex, shaders.skyFragment, {
      depthTest: false,
      depthWrite: false,
    });
    this.skyMaterials = new Map();
    this.geometryMaterial = createShaderMaterial(shaders.geometryVertex, shaders.geometryFragment);
    this.particleMaterial = createShaderMaterial(
      shaders.particleProgramVertex,
      shaders.particleProgramFragment,
      { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending },
    );
    this.glassMaterial = createShaderMaterial(
      shaders.glassProgramVertex,
      shaders.glassProgramFragment,
      {
        transparent: true,
        depthWrite: false,
      },
    );
    this.postProcessingMaterial = createShaderMaterial(shaders.postVertex, shaders.postFragment, {
      depthTest: false,
      depthWrite: false,
    });
    this.opaqueGeometryMesh = new DynamicGeometryMesh(this.geometryMaterial, [
      ['position', 3],
      ['color', 3],
    ]);
    this.particleGeometryMesh = new DynamicGeometryMesh(this.particleMaterial, [
      ['position', 3],
      ['color', 3],
      ['corner', 2],
      ['shape', 2],
    ]);
    this.glassGeometryMesh = new DynamicGeometryMesh(this.glassMaterial, [
      ['position', 3],
      ['normal', 3],
      ['color', 3],
      ['opacity', 1],
    ]);
    this.scene.add(this.opaqueGeometryMesh);
    this.particleScene = new THREE.Scene();
    this.particleScene.add(this.particleGeometryMesh);
    this.glassScene = new THREE.Scene();
    this.glassScene.add(this.glassGeometryMesh);
    this.screenScene = new THREE.Scene();
    this.screenCamera = new THREE.Camera();
    const quad = new THREE.BufferGeometry();
    quad.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-1, -1, 0, 1, -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0],
        3,
      ),
    );
    this.screenQuad = new THREE.Mesh(quad, this.sky);
    this.screenQuad.frustumCulled = false;
    this.screenScene.add(this.screenQuad);
    this.sceneRenderTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.backdropTexture = new THREE.FramebufferTexture(1, 1);
    this.fogColor = new THREE.Color();
  }
  setMaterialUniformValues(material: THREE.RawShaderMaterial, values: Record<string, unknown>) {
    for (const [name, value] of Object.entries(values))
      if (material.uniforms[name]) material.uniforms[name].value = value;
  }
  renderFullscreenPass(material: THREE.RawShaderMaterial) {
    this.screenQuad.material = material;
    this.renderer.render(this.screenScene, this.screenCamera);
  }
  begin(
    viewportWidth: number,
    viewportHeight: number,
    palette: Palette,
    sky: SkyDefinition | undefined,
    time: number,
    transition = 0,
    reduced = false,
    atmosphere: AtmosphereCameraState | null = null,
  ) {
    const renderer = this.renderer;
    renderer.info.reset();
    if (viewportWidth !== this.viewportWidth || viewportHeight !== this.viewportHeight) {
      this.viewportWidth = viewportWidth;
      this.viewportHeight = viewportHeight;
      renderer.setSize(viewportWidth, viewportHeight, false);
      this.sceneRenderTarget.setSize(viewportWidth, viewportHeight);
      this.backdropTexture.dispose();
      this.backdropTexture = new THREE.FramebufferTexture(viewportWidth, viewportHeight);
    }
    renderer.setRenderTarget(this.sceneRenderTarget);
    renderer.setClearColor(this.fogColor.fromArray(palette.sky), 1);
    renderer.clear();
    let skyMaterial = this.sky;
    if (sky) {
      if (!this.skyMaterials.has(sky))
        this.skyMaterials.set(
          sky,
          createShaderMaterial(shaders.skyVertex, sky.fragment, {
            depthTest: false,
            depthWrite: false,
          }),
        );
      skyMaterial = this.skyMaterials.get(sky)!;
    }
    const v = atmosphere?.view;
    const skyFrame: SkyFrame = {
      width: viewportWidth,
      height: viewportHeight,
      palette,
      time,
      transition,
      reduced,
      eye: atmosphere?.eye ?? [0, 6, 0],
      view: v,
      fov: atmosphere?.fov ?? Math.PI / 3,
    };
    this.setMaterialUniformValues(skyMaterial, {
      skyTop: palette.sky,
      skyBottom: palette.horizon,
      accent: palette.accent,
      aspect: viewportWidth / viewportHeight,
      time,
      transition,
      skyEye: skyFrame.eye,
      skyLens: Math.tan(skyFrame.fov / 2),
      skyHeight: viewportHeight,
      skyRight: v ? [v[0], v[4], v[8]] : [1, 0, 0],
      skyUp: v ? [v[1], v[5], v[9]] : [0, 1, 0],
      skyForward: v ? [-v[2], -v[6], -v[10]] : [0, 0, 1],
      ...sky?.uniforms?.(skyFrame),
    });
    this.renderFullscreenPass(skyMaterial);
  }
  /** Apply the same local-to-world transform as procedural runner vertices. */
  placeRunner(project: (point: Vec3) => Vec3) {
    const origin = project([0, 0, 0]);
    const axes = (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as Vec3[]
    ).map((p) => project(p).map((v, i) => v - origin[i]));
    this.runnerRoot.matrix.set(
      axes[0][0],
      axes[1][0],
      axes[2][0],
      origin[0],
      axes[0][1],
      axes[1][1],
      axes[2][1],
      origin[1],
      axes[0][2],
      axes[1][2],
      axes[2][2],
      origin[2],
      0,
      0,
      0,
      1,
    );
    this.runnerRoot.matrixWorldNeedsUpdate = true;
  }
  draw(
    vertices: readonly number[],
    view: Float32Array,
    projection: Float32Array,
    palette: Palette,
    transition: number,
    fogDistance = 360,
    particleVertices: readonly number[] = [],
    glassVertices: readonly number[] = [],
  ) {
    const renderer = this.renderer;
    this.camera.matrixWorldInverse.fromArray(view);
    this.camera.matrixWorld.copy(this.camera.matrixWorldInverse).invert();
    this.camera.matrix.copy(this.camera.matrixWorld);
    this.camera.matrix.decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
    this.camera.projectionMatrix.fromArray(projection);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.camera.fov = (2 * Math.atan(1 / projection[5]) * 180) / Math.PI;
    this.camera.aspect = projection[5] / projection[0];
    this.camera.near = projection[14] / (projection[10] - 1);
    this.camera.far = projection[14] / (projection[10] + 1);
    this.opaqueGeometryMesh.upload(vertices);
    this.particleGeometryMesh.upload(particleVertices);
    this.setMaterialUniformValues(this.geometryMaterial, {
      view,
      projection,
      fogColor: palette.horizon,
      transition,
      fogDistance,
    });
    this.setMaterialUniformValues(this.particleMaterial, {
      view,
      projection,
      transition,
      fogDistance,
    });
    if (!(this.scene.fog instanceof THREE.FogExp2)) this.scene.fog = new THREE.FogExp2(0);
    this.scene.fog.color.fromArray(palette.horizon);
    this.scene.fog.density = 1 / fogDistance;
    renderer.render(this.scene, this.camera);
    renderer.render(this.particleScene, this.camera);
    if (glassVertices.length) {
      renderer.copyFramebufferToTexture(this.backdropTexture);
      const faces = [];
      for (let i = 0; i < glassVertices.length; i += 30) {
        const face = glassVertices.slice(i, i + 30);
        const depth =
          -[0, 10, 20].reduce(
            (sum, j) => sum + view[2] * face[j] + view[6] * face[j + 1] + view[10] * face[j + 2],
            0,
          ) / 3;
        faces.push({ face, depth });
      }
      faces.sort((a, b) => b.depth - a.depth);
      this.glassGeometryMesh.upload(faces.flatMap((f) => f.face));
      this.setMaterialUniformValues(this.glassMaterial, {
        view,
        projection,
        backdrop: this.backdropTexture,
        viewport: [this.viewportWidth, this.viewportHeight],
        skyTop: palette.sky,
        skyBottom: palette.horizon,
        transition,
        fogDistance,
      });
      renderer.render(this.glassScene, this.camera);
    }
    renderer.setRenderTarget(null);
    this.setMaterialUniformValues(this.postProcessingMaterial, {
      frameTexture: this.sceneRenderTarget.texture,
      pixel: [1 / this.viewportWidth, 1 / this.viewportHeight],
      transition,
      fogColor: palette.horizon,
    });
    this.renderFullscreenPass(this.postProcessingMaterial);
  }
  dispose() {
    for (const mesh of [
      this.opaqueGeometryMesh,
      this.particleGeometryMesh,
      this.glassGeometryMesh,
      this.screenQuad,
    ])
      mesh.geometry.dispose();
    for (const m of [
      this.sky,
      this.geometryMaterial,
      this.particleMaterial,
      this.glassMaterial,
      this.postProcessingMaterial,
    ])
      m.dispose();
    for (const sky of this.skyMaterials.values()) sky.dispose();
    this.skyMaterials.clear();
    this.sceneRenderTarget.dispose();
    this.backdropTexture.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }
}
