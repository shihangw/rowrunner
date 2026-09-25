import type {
  SceneOptions,
  GeometryBuilder,
  Vec3,
  Color,
  Palette,
  SceneFrame,
  ModelData,
  CameraMode,
  RoadEffect,
  SpeedScale,
  ResolvedScene,
  ResolvedProtagonist,
  SceneDefinition,
  ProtagonistDefinition,
  WorldPlugin,
  RunnerPlugin,
} from './scene_types.js';
export type * from './scene_types.js';
export * from './scene_configuration_schemas.js';
// Renderer and motion host. Worlds and runners are supplied by the application.
import {SceneOptionsSchema} from './scene_configuration_schemas.js';
import {parseInput} from './input_validation.js';
import {validatePreset} from './preset_validation.js';
import {PluginInstanceHost} from './plugins/plugin_instance_host.js';
import {createPluginRegistry} from './plugins/plugin_registry.js';
import {SceneRenderer} from './scene_renderer.js';
import {drawRoad, roadSurface, validateRoadEffect} from './road_geometry.js';
import {
  cameraPose,
  validateCamera,
  CinematicCameraDirector,
  StationaryCameraPass,
  stationaryPose,
  sceneRange,
  travelSpeed,
  validateSpeedScale,
} from './camera_controller.js';
import {
  sceneCatalog,
  protagonistCatalog,
} from './scene_configuration_catalog.js';
export {CAMERA_MODES} from './camera_controller.js';
export {CompletionCelebration} from './completion_celebration.js';
const roadCenterOffsetAtDistance = (distance: number) =>
  24 * Math.sin(distance / 240) + 12 * Math.sin(distance / 100);
const normalizedVector = (vector: readonly number[]): Vec3 => {
  const magnitude = Math.hypot(...vector);
  const vectorLength =
    magnitude === 0 || Number.isNaN(magnitude) ? 1 : magnitude;
  return [
    vector[0] / vectorLength,
    vector[1] / vectorLength,
    vector[2] / vectorLength,
  ];
};
const crossProduct = (
  firstVector: readonly number[],
  secondVector: readonly number[],
): Vec3 => [
  firstVector[1] * secondVector[2] - firstVector[2] * secondVector[1],
  firstVector[2] * secondVector[0] - firstVector[0] * secondVector[2],
  firstVector[0] * secondVector[1] - firstVector[1] * secondVector[0],
];
const dotProduct = (
  firstVector: readonly number[],
  secondVector: readonly number[],
) =>
  firstVector.reduce(
    (sum, component, componentIndex) =>
      sum + component * secondVector[componentIndex],
    0,
  );
function createCameraViewMatrix(eye: Vec3, target: Vec3) {
  const z = normalizedVector(eye.map((v, i) => v - target[i]));
  const x = normalizedVector(crossProduct([0, 1, 0], z));
  const y = crossProduct(z, x);
  return [
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dotProduct(x, eye),
    -dotProduct(y, eye),
    -dotProduct(z, eye),
    1,
  ];
}

export class RoadScene {
  readonly scenes: readonly ResolvedScene[];
  readonly protagonists: readonly ResolvedProtagonist[];
  scenePreset: string;
  mascotPreset: string;
  cameraMode: CameraMode;
  cameraShot: string;
  autoBiomes: boolean;
  roadEffect: RoadEffect;
  speedScale: SpeedScale;
  visualRateMultiplier: number;
  distance: number;
  private time: number;
  private cameraTime: number;
  private stationaryPass: StationaryCameraPass;
  private cinematic?: CinematicCameraDirector;
  readonly worldSwitchIntervalSeconds: number;
  private worldElapsedSeconds = 0;
  private biomeTransition: {
    from: string;
    to: string;
    start: number;
    synchronizeCamera?: boolean;
  } | null;
  private pathEntry: {
    id: string;
    distance: number;
    time: number;
    introFinished: boolean;
  } | null = null;
  private readonly geometry: GeometryBuilder;
  private readonly canvas: HTMLCanvasElement;
  private readonly reducedMotion: MediaQueryList;
  private readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  private sceneRenderer!: SceneRenderer;
  private readonly onLost: (event: Event) => void;
  private readonly onRestored: () => void;
  private lost = false;
  private disposed = false;
  private wasCompleted = false;
  private pluginHost?: PluginInstanceHost;
  private transform: ((point: Vec3) => Vec3) | null = null;
  private worldTransform: ((point: Vec3) => Vec3) | null = null;
  private vertices: number[] = [];
  private particles: number[] = [];
  private glass: number[] = [];
  private particleScale = 1;

  constructor(
    canvas: HTMLCanvasElement,
    {
      scene,
      protagonist,
      mascot,
      scenes,
      protagonists,
      camera: cameraMode = 'cinematic',
      autoBiomes = false,
      worldSwitchIntervalSeconds = 20,
      plugins,
      world,
      runner,
      worlds,
      runners,
      roadEffect = 'none',
      speedScale = 'logarithmic',
      visualRateMultiplier = 1,
    }: SceneOptions = {},
  ) {
    const alias = <T>(
      oldValue: T | undefined,
      newValue: T | undefined,
      name: string,
    ) => {
      if (
        oldValue !== undefined &&
        newValue !== undefined &&
        oldValue !== newValue
      ) {
        throw new TypeError(`Conflicting ${name} aliases`);
      }
      return newValue ?? oldValue;
    };
    scene = alias(scene, world, 'world');
    scenes = alias(scenes, worlds, 'worlds');
    protagonist = alias(protagonist, runner, 'runner');
    protagonists = alias(protagonists, runners, 'runners');
    if (plugins !== undefined && !Array.isArray(plugins)) {
      throw new TypeError('plugins must be an array');
    }
    const installed = [...(plugins ?? [])];
    for (const entries of [scenes, protagonists]) {
      if (entries !== undefined) {
        if (!Array.isArray(entries)) {
          throw new TypeError('scenes/protagonists must be arrays');
        }
        for (const entry of entries) {
          if (
            typeof entry === 'object' &&
            entry != null &&
            'kind' in entry &&
            !installed.includes(entry as WorldPlugin | RunnerPlugin)
          ) {
            installed.push(entry as WorldPlugin | RunnerPlugin);
          }
        }
      }
    }
    const registry = createPluginRegistry(installed);
    const lineup = <T extends SceneDefinition | ProtagonistDefinition>(
      entries?: readonly (string | T)[],
    ) =>
      entries?.map((entry) =>
        typeof entry === 'object' && entry != null && 'kind' in entry
          ? entry.id
          : entry,
      );
    scenes = lineup(scenes);
    protagonists = lineup(protagonists);
    this.scenes = sceneCatalog(scenes, registry.worlds);
    this.protagonists = protagonistCatalog(protagonists, registry.runners);
    if (
      protagonist !== undefined &&
      mascot !== undefined &&
      protagonist !== mascot
    ) {
      throw new TypeError(
        'protagonist and mascot must agree when both are provided',
      );
    }
    this.scenePreset = validatePreset(
      scene ?? this.scenes[0].id,
      this.scenes,
      'scene',
    );
    this.mascotPreset = validatePreset(
      protagonist ?? mascot ?? this.protagonists[0].id,
      this.protagonists,
      'protagonist',
    );
    this.cameraMode = validateCamera(cameraMode);
    this.cameraShot = cameraPose(0, cameraMode).label;
    if (typeof autoBiomes !== 'boolean') {
      throw new TypeError('autoBiomes must be a boolean');
    }
    this.autoBiomes = autoBiomes;
    this.worldSwitchIntervalSeconds = parseInput(
      SceneOptionsSchema.shape.worldSwitchIntervalSeconds,
      worldSwitchIntervalSeconds,
      'worldSwitchIntervalSeconds',
    )!;
    this.roadEffect = validateRoadEffect(roadEffect);
    this.speedScale = validateSpeedScale(speedScale);
    this.visualRateMultiplier = parseInput(
      SceneOptionsSchema.shape.visualRateMultiplier,
      visualRateMultiplier,
      'visualRateMultiplier',
    )!;
    this.cameraTime = 0;
    this.stationaryPass = new StationaryCameraPass();
    this.worldElapsedSeconds = 0;
    this.biomeTransition = null;
    this.geometry = Object.freeze({
      triangle: this.triangle.bind(this),
      gradientTriangle: this.gradientTriangle.bind(this),
      quad: this.quad.bind(this),
      box: this.box.bind(this),
      mountain: this.mountain.bind(this),
      ellipsoid: this.ellipsoid.bind(this),
      ring: this.ring.bind(this),
      tube: this.tube.bind(this),
      model: this.model.bind(this),
      particle: this.particle.bind(this),
      glassTriangle: this.glassTriangle.bind(this),
    });
    this.canvas = canvas;
    this.distance = 0;
    this.time = 0;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.setup();
    this.gl = this.sceneRenderer.renderer.getContext();
    this.onLost = (e) => {
      e.preventDefault();
      this.lost = true;
    };
    this.onRestored = () => {
      this.lost = false;
    };
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }
  get worlds() {
    return this.scenes;
  }
  get runners() {
    return this.protagonists;
  }
  get world() {
    return this.scenePreset;
  }
  get runner() {
    return this.protagonist;
  }
  setWorld(id: string) {
    this.setScene(id);
  }
  setRunner(id: string) {
    this.setProtagonist(id);
  }
  /** Change presentation without resetting distance, animation time, or telemetry. */
  setScene(id: string) {
    this.scenePreset = validatePreset(id, this.scenes, 'scene');
    this.worldElapsedSeconds = 0;
    this.biomeTransition = null;
    this.pathEntry = null;
  }
  setCamera(mode: CameraMode) {
    validateCamera(mode);
    if (mode === 'stationary' && this.cameraMode !== mode) {
      this.stationaryPass = new StationaryCameraPass(this.distance);
    }
    if (mode === 'cinematic' && this.cameraMode !== mode) {
      this.cinematic?.rebase(this.distance);
    }
    if (mode !== this.cameraMode && this.pathEntry != null) {
      this.pathEntry!.introFinished = true;
    }
    this.cameraMode = mode;
  }
  setAutoBiomes(enabled: boolean) {
    if (typeof enabled !== 'boolean') {
      throw new TypeError('autoBiomes must be a boolean');
    }
    this.autoBiomes = enabled;
    this.worldElapsedSeconds = 0;
    this.biomeTransition = null;
  }
  setRoadEffect(effect: RoadEffect) {
    this.roadEffect = validateRoadEffect(effect);
  }
  setSpeedScale(scale: SpeedScale) {
    this.speedScale = validateSpeedScale(scale);
  }
  setVisualRateMultiplier(multiplier: number) {
    this.visualRateMultiplier = parseInput(
      SceneOptionsSchema.shape.visualRateMultiplier,
      multiplier,
      'visualRateMultiplier',
    )!;
  }
  get protagonist() {
    return this.mascotPreset;
  }
  setProtagonist(id: string) {
    this.mascotPreset = validatePreset(id, this.protagonists, 'protagonist');
  }
  setMascot(id: string) {
    this.setProtagonist(id);
  }
  private setup() {
    this.sceneRenderer = new SceneRenderer(this.canvas);
  }
  get renderer() {
    return this.sceneRenderer.renderer;
  }
  get threeScene() {
    return this.sceneRenderer.scene;
  }
  get threeCamera() {
    return this.sceneRenderer.camera;
  }
  private projectPoint(localPoint: Vec3): Vec3 {
    const runnerTransformedPoint =
      this.transform != null ? this.transform(localPoint) : localPoint;
    return this.worldTransform != null
      ? this.worldTransform(runnerTransformedPoint)
      : runnerTransformedPoint;
  }
  private triangle(
    firstVertex: Vec3,
    secondVertex: Vec3,
    thirdVertex: Vec3,
    color: Color,
    unlit = false,
  ) {
    let light = 1;
    if (!unlit) {
      const surfaceNormal = normalizedVector(
        crossProduct(
          secondVertex.map((v, i) => v - firstVertex[i]),
          thirdVertex.map((v, i) => v - firstVertex[i]),
        ),
      );
      light =
        0.65 + 0.35 * Math.abs(dotProduct(surfaceNormal, [0.3, 0.85, -0.4]));
    }
    const red = color[0] * light;
    const green = color[1] * light;
    const blue = color[2] * light;
    for (const vertex of [firstVertex, secondVertex, thirdVertex]) {
      const projectedVertex = this.projectPoint(vertex);
      this.vertices.push(
        projectedVertex[0],
        projectedVertex[1],
        projectedVertex[2],
        red,
        green,
        blue,
      );
    }
  }
  private gradientTriangle(
    firstVertex: Vec3,
    secondVertex: Vec3,
    thirdVertex: Vec3,
    firstColor: Color,
    secondColor: Color,
    thirdColor: Color,
  ) {
    this._gradientTriangle(
      firstVertex,
      secondVertex,
      thirdVertex,
      firstColor,
      secondColor,
      thirdColor,
    );
  }
  // Internal smooth surfaces carry lighting at each shared vertex.
  private _gradientTriangle(
    firstVertex: Vec3,
    secondVertex: Vec3,
    thirdVertex: Vec3,
    firstColor: Color,
    secondColor: Color,
    thirdColor: Color,
  ) {
    const firstProjectedVertex = this.projectPoint(firstVertex);
    const secondProjectedVertex = this.projectPoint(secondVertex);
    const thirdProjectedVertex = this.projectPoint(thirdVertex);
    this.vertices.push(
      firstProjectedVertex[0],
      firstProjectedVertex[1],
      firstProjectedVertex[2],
      firstColor[0],
      firstColor[1],
      firstColor[2],
      secondProjectedVertex[0],
      secondProjectedVertex[1],
      secondProjectedVertex[2],
      secondColor[0],
      secondColor[1],
      secondColor[2],
      thirdProjectedVertex[0],
      thirdProjectedVertex[1],
      thirdProjectedVertex[2],
      thirdColor[0],
      thirdColor[1],
      thirdColor[2],
    );
  }
  private quad(
    firstVertex: Vec3,
    secondVertex: Vec3,
    thirdVertex: Vec3,
    fourthVertex: Vec3,
    color: Color,
    unlit = false,
  ) {
    this.triangle(firstVertex, secondVertex, thirdVertex, color, unlit);
    this.triangle(firstVertex, thirdVertex, fourthVertex, color, unlit);
  }
  private glassTriangle(
    firstVertex: Vec3,
    secondVertex: Vec3,
    thirdVertex: Vec3,
    color: Color,
    opacity = 0.55,
  ) {
    const points = [firstVertex, secondVertex, thirdVertex].map((vertex) =>
      this.projectPoint(vertex),
    );
    const normal = normalizedVector(
      crossProduct(
        points[1].map((v, i) => v - points[0][i]),
        points[2].map((v, i) => v - points[0][i]),
      ),
    );
    this.glass ??= [];
    for (const vertex of points) {
      this.glass.push(...vertex, ...normal, ...color, opacity);
    }
  }
  /** Soft, camera-facing glow, depth-tested against the scene. */
  private particle(center: Vec3, radius: number, color: Color, opacity = 1) {
    const position = this.projectPoint(center);
    const size = radius * (this.particleScale ?? 1);
    this.particles ??= [];
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ]) {
      this.particles.push(...position, ...color, x, y, size, opacity);
    }
  }
  private box(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color: Color,
  ) {
    const corners: Vec3[] = [
      [x - width / 2, y, z - depth / 2],
      [x + width / 2, y, z - depth / 2],
      [x + width / 2, y + height, z - depth / 2],
      [x - width / 2, y + height, z - depth / 2],
      [x - width / 2, y, z + depth / 2],
      [x + width / 2, y, z + depth / 2],
      [x + width / 2, y + height, z + depth / 2],
      [x - width / 2, y + height, z + depth / 2],
    ];
    for (const faceIndices of [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 5, 6, 2],
      [3, 2, 6, 7],
      [0, 1, 5, 4],
    ]) {
      this.quad(
        corners[faceIndices[0]],
        corners[faceIndices[1]],
        corners[faceIndices[2]],
        corners[faceIndices[3]],
        color,
      );
    }
  }
  private mountain(
    x: number,
    z: number,
    width: number,
    height: number,
    color: Color,
  ) {
    const a: Vec3 = [x - width, -1, z - width];
    const b: Vec3 = [x + width, -1, z - width];
    const c: Vec3 = [x + width, -1, z + width];
    const d: Vec3 = [x - width, -1, z + width];
    const tip: Vec3 = [x, height, z];
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ]) {
      this.triangle(p, q, tip, color);
    }
  }
  private ellipsoid(
    center: Vec3,
    radius: Vec3,
    color: Color,
    segments = 16,
    rings = 10,
    smooth = false,
  ) {
    const point = (i: number, j: number): Vec3 => {
      const lat = -Math.PI / 2 + (i / rings) * Math.PI;
      const lon = (j / segments) * Math.PI * 2;
      return [
        center[0] + radius[0] * Math.cos(lat) * Math.cos(lon),
        center[1] + radius[1] * Math.sin(lat),
        center[2] + radius[2] * Math.cos(lat) * Math.sin(lon),
      ];
    };
    const face = (a: Vec3, b: Vec3, c: Vec3) => {
      if (!smooth) {
        return this.triangle(a, b, c, color);
      }
      // Analytic surface normals share lighting across triangle boundaries.
      // Interpolated vertex colors preserve the existing geometry pipeline.
      for (const p of [a, b, c]) {
        const n = normalizedVector(
          p.map((v, i) => (v - center[i]) / (radius[i] * radius[i])),
        );
        const light = 0.65 + 0.35 * Math.abs(dotProduct(n, [0.3, 0.85, -0.4]));
        const q = this.projectPoint(p);
        this.vertices.push(
          q[0],
          q[1],
          q[2],
          color[0] * light,
          color[1] * light,
          color[2] * light,
        );
      }
    };
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segments; j++) {
        const a = point(i, j);
        const b = point(i, j + 1);
        const c = point(i + 1, j + 1);
        const d = point(i + 1, j);
        if (i > 0) {
          face(a, b, c);
        }
        if (i < rings - 1) {
          face(a, c, d);
        }
      }
    }
  }
  private ring(center: Vec3, radius: number, thickness: number, color: Color) {
    const point = (angle: number, r: number): Vec3 => [
      center[0] + Math.cos(angle) * r,
      center[1] + Math.sin(angle) * r,
      center[2] - 0.1,
    ];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const b = ((i + 1) / 32) * Math.PI * 2;
      this.quad(
        point(a, radius - thickness / 2),
        point(a, radius + thickness / 2),
        point(b, radius + thickness / 2),
        point(b, radius - thickness / 2),
        color,
        true,
      );
    }
  }
  private tube(a: Vec3, b: Vec3, radius: number, color: Color) {
    const axis = normalizedVector(b.map((v, i) => v - a[i]));
    const u = normalizedVector(
      crossProduct(axis, Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]),
    );
    const v = crossProduct(axis, u);
    const point = (p: Vec3, angle: number): Vec3 =>
      p.map(
        (value, i) =>
          value + radius * (Math.cos(angle) * u[i] + Math.sin(angle) * v[i]),
      ) as unknown as Vec3;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const next = ((i + 1) / 8) * Math.PI * 2;
      this.quad(
        point(a, angle),
        point(a, next),
        point(b, next),
        point(b, angle),
        color,
      );
    }
  }
  private model(
    modelData: ModelData,
    center: Vec3,
    scale: number,
    rotation = 0,
    tint: Color | null = null,
  ) {
    const rotationCosine = Math.cos(rotation);
    const rotationSine = Math.sin(rotation);
    const vertices = modelData.positions.map(([x, y, z]): Vec3 => [
      center[0] + scale * (x * rotationCosine - z * rotationSine),
      center[1] + scale * y,
      center[2] + scale * (x * rotationSine + z * rotationCosine),
    ]);
    for (const [a, b, c, index] of modelData.faces) {
      const color = (modelData.colors[index] ?? [0.5, 0.5, 0.5]) as Color;
      const brightness = (color[0] + color[1] + color[2]) / 3;
      this.triangle(
        vertices[a],
        vertices[b],
        vertices[c],
        tint != null
          ? (tint.map(
              (v) => v * (0.45 + brightness * 0.55),
            ) as unknown as Color)
          : color,
      );
    }
  }
  private updateBiome(
    cinematicWorldChangeRequested = false,
    allowWorldChange = true,
  ) {
    if (
      this.autoBiomes &&
      allowWorldChange &&
      this.scenes.length > 1 &&
      this.biomeTransition == null &&
      (this.cameraMode === 'cinematic'
        ? cinematicWorldChangeRequested
        : this.worldElapsedSeconds >= this.worldSwitchIntervalSeconds)
    ) {
      const index = this.scenes.findIndex((p) => p.id === this.scenePreset)!;
      this.biomeTransition = {
        from: this.scenePreset,
        to: this.scenes[(index + 1) % this.scenes.length].id,
        start: this.time,
        synchronizeCamera: this.cameraMode === 'cinematic',
      };
    }
    const paletteFor = (id: string) =>
      this.scenes.find((p) => p.id === id)!.palette;
    let palette = paletteFor(this.scenePreset);
    let fade = 0;
    if (this.biomeTransition != null) {
      const {from, to, start} = this.biomeTransition;
      const duration =
        this.biomeTransition.synchronizeCamera === true ? 1.2 : 6;
      const raw = Math.min(1, Math.max(0, (this.time - start) / duration));
      const mix = raw * raw * (3 - 2 * raw);
      palette = Object.fromEntries(
        Object.entries(paletteFor(from)).map(([key, a]) => [
          key,
          a.map(
            (v: number, i: number) =>
              v + (paletteFor(to)[key as keyof Palette][i] - v) * mix,
          ),
        ]),
      ) as unknown as Palette;
      fade = Math.sin(raw * Math.PI) ** 4;
      if (raw >= 0.5 && this.scenePreset !== to) {
        this.scenePreset = to;
        this.worldElapsedSeconds = 0;
        fade = 1;
      }
      if (raw === 1) {
        this.biomeTransition = null;
      }
    }
    return {palette, fade};
  }
  render(
    processingRate: number,
    deltaSeconds: number,
    {
      reduced = false,
      completed = false,
    }: {reduced?: boolean; completed?: boolean} = {},
  ) {
    if (this.lost || this.disposed) {
      return;
    }
    if (
      !Number.isFinite(processingRate) ||
      processingRate < 0 ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds < 0
    ) {
      return;
    }
    if (this.cameraMode === 'cinematic') {
      this.cinematic ??= new CinematicCameraDirector(this.distance);
    }
    // Completion temporarily frames the protagonist from the front. Keep the
    // caller's selected camera so a new run resumes its original composition.
    if (this.wasCompleted && !completed && this.cameraMode === 'stationary') {
      this.stationaryPass = new StationaryCameraPass(this.distance);
    }
    if (this.wasCompleted && !completed && this.cameraMode === 'cinematic') {
      this.cinematic!.rebase(this.distance);
    }
    this.wasCompleted = completed;
    const activeCameraMode = completed ? 'approach' : this.cameraMode;
    const cinematicDirector =
      activeCameraMode === 'cinematic' ? this.cinematic : null;
    const isMotionReduced = reduced || this.reducedMotion.matches;
    const frameDeltaSeconds = Math.min(deltaSeconds, 0.05);
    const visualSpeed = isMotionReduced
      ? 0
      : travelSpeed(
          Math.min(
            Number.MAX_VALUE,
            processingRate * (this.visualRateMultiplier ?? 1),
          ),
          this.speedScale,
        );
    let cinematicWorldChangeRequested = false;
    this.worldElapsedSeconds ??= 0;
    if (
      !isMotionReduced &&
      !completed &&
      processingRate > 0 &&
      this.autoBiomes
    ) {
      this.worldElapsedSeconds += frameDeltaSeconds;
    }
    if (!isMotionReduced) {
      this.distance += visualSpeed * frameDeltaSeconds;
      this.time += frameDeltaSeconds;
      if (processingRate > 1) {
        this.cameraTime += frameDeltaSeconds;
      }
      const isFadingOutWorld =
        this.biomeTransition?.synchronizeCamera === true &&
        this.scenePreset === this.biomeTransition.from;
      if (isFadingOutWorld) {
        cinematicDirector?.pass?.advance(
          processingRate,
          0,
          this.distance,
          visualSpeed,
          false,
        );
      }
      if (
        (this.pathEntry == null || this.pathEntry!.introFinished) &&
        !isFadingOutWorld
      ) {
        const shotFinished = cinematicDirector?.advance(
          processingRate,
          frameDeltaSeconds,
          this.distance,
          visualSpeed,
          false,
        );
        if (shotFinished === true) {
          const shouldCycleWorld = this.autoBiomes && this.scenes.length > 1;
          cinematicWorldChangeRequested =
            shouldCycleWorld &&
            this.worldElapsedSeconds >= this.worldSwitchIntervalSeconds;
          if (!cinematicWorldChangeRequested) {
            cinematicDirector!.next(this.distance, visualSpeed);
          }
        }
      }
      if (activeCameraMode === 'stationary') {
        this.stationaryPass.advance(
          processingRate,
          frameDeltaSeconds,
          this.distance,
          visualSpeed,
        );
      }
    }
    const previousWorld = this.scenePreset;
    // Freeze an in-flight fade while paused, completed, or reducing motion.
    if (
      this.biomeTransition != null &&
      (completed || processingRate <= 0) &&
      !isMotionReduced
    ) {
      this.biomeTransition.start += frameDeltaSeconds;
    }
    const {palette, fade} = this.updateBiome(
      cinematicWorldChangeRequested,
      !completed && !isMotionReduced && processingRate > 0,
    );
    if (
      previousWorld !== this.scenePreset &&
      this.biomeTransition?.synchronizeCamera === true
    ) {
      // Swap geometry and camera together at the fully obscured midpoint.
      cinematicDirector?.next(this.distance, visualSpeed);
      this.pathEntry = null;
    }
    const world = this.scenes.find((p) => p.id === this.scenePreset)!;
    const hasCurvedPath = Boolean(world.path);
    if (hasCurvedPath && this.pathEntry?.id !== world.id) {
      this.pathEntry = {
        id: world.id,
        distance: this.distance,
        time: this.time,
        introFinished: this.cameraMode !== 'cinematic',
      };
    } else if (!hasCurvedPath) {
      this.pathEntry = null;
    }
    let isPlayingPathIntroduction = false;
    if (hasCurvedPath && !this.pathEntry!.introFinished) {
      isPlayingPathIntroduction =
        !completed &&
        this.time - this.pathEntry!.time < (world.path!.introDuration ?? 0);
      if (!isPlayingPathIntroduction) {
        this.pathEntry!.introFinished = true;
        cinematicDirector?.rebase(this.distance);
      }
    }
    const stationaryFrame = isPlayingPathIntroduction
      ? null
      : (cinematicDirector?.pass?.frame ??
        (activeCameraMode === 'stationary' ? this.stationaryPass.frame : null));
    const isStationary = stationaryFrame !== null;
    const worldOriginDistance =
      stationaryFrame != null ? stationaryFrame.worldDistance : this.distance;
    const roadCenterXAt = hasCurvedPath
      ? () => 0
      : (z: number) =>
          roadCenterOffsetAtDistance(worldOriginDistance + z) -
          roadCenterOffsetAtDistance(worldOriginDistance);
    const canvasBounds = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(
      devicePixelRatio > 0 ? devicePixelRatio : 1,
      1.75,
    );
    const viewportWidth = Math.round(canvasBounds.width * pixelRatio);
    const viewportHeight = Math.round(canvasBounds.height * pixelRatio);
    if (viewportWidth === 0 || viewportHeight === 0) {
      return;
    }
    let fieldOfViewRadians =
      ((isStationary
        ? 58
        : isMotionReduced
          ? 54
          : 54 + 5 * Math.min(processingRate / 1500, 1)) *
        Math.PI) /
      180;
    if (isPlayingPathIntroduction) {
      fieldOfViewRadians = Math.max(
        fieldOfViewRadians,
        2 *
          Math.atan(
            Math.tan(
              (((world.path!.introHorizontalFov ?? 70) / 2) * Math.PI) / 180,
            ) /
              (viewportWidth / viewportHeight),
          ),
      );
    }
    let pose = isPlayingPathIntroduction
      ? cameraPose(0, 'chase')
      : stationaryFrame != null
        ? stationaryPose(stationaryFrame, roadCenterXAt)
        : cinematicDirector != null
          ? cinematicDirector.pose()
          : cameraPose(this.cameraTime, activeCameraMode);
    if (world.path?.camera != null) {
      pose = world.path!.camera(pose, isStationary, completed);
    }
    if (isPlayingPathIntroduction) {
      pose = {...pose, label: `${world.name} · arrival`};
    }
    let {near: roadStart, far: roadEnd} = sceneRange(
      pose,
      fieldOfViewRadians,
      viewportWidth / viewportHeight,
      stationaryFrame?.segmentLength,
    );
    // Tessellate only the nearby arc, never the million-unit circumference.
    if (hasCurvedPath) {
      roadStart = Math.min(roadStart, -(world.path!.minRange ?? 0));
      roadEnd = Math.max(roadEnd, world.path!.minRange ?? 0);
    }
    const projectionScale = 1 / Math.tan(fieldOfViewRadians / 2);
    const nearClipDistance = 0.7;
    const farClipDistance = Math.max(
      1300,
      (stationaryFrame?.segmentLength ?? 0) * 2,
    );
    const projectionMatrix = new Float32Array([
      projectionScale / (viewportWidth / viewportHeight),
      0,
      0,
      0,
      0,
      projectionScale,
      0,
      0,
      0,
      0,
      (farClipDistance + nearClipDistance) /
        (nearClipDistance - farClipDistance),
      -1,
      0,
      0,
      (2 * farClipDistance * nearClipDistance) /
        (nearClipDistance - farClipDistance),
      0,
    ]);
    this.cameraShot = pose.label;
    const orbit = hasCurvedPath
      ? world.path!.createFrame(worldOriginDistance, this.pathEntry!.distance)
      : null;
    const eye = orbit != null ? orbit.localPoint(pose.eye) : pose.eye;
    const target = orbit != null ? orbit.localPoint(pose.target) : pose.target;
    const viewMatrix = new Float32Array(createCameraViewMatrix(eye, target));
    const runnerDefinition = this.protagonists.find(
      (p) => p.id === this.protagonist,
    )!;
    const runnerZ = stationaryFrame?.protagonistZ ?? 0;
    const runnerX = stationaryFrame != null ? roadCenterXAt(runnerZ) : 0;
    const renewalFrontDistance = this.distance + runnerDefinition.offset[2];
    // Travel is always +Z along the road. Orient each model's authored front
    // along that tangent, independently of which camera happens to observe it.
    const runnerHeadingRadians =
      Math.atan2(
        roadCenterXAt(runnerZ + 0.1) - roadCenterXAt(runnerZ - 0.1),
        0.2,
      ) + (runnerDefinition.forwardAxis === '-z' ? Math.PI : 0);
    const headingCosine = Math.cos(runnerHeadingRadians);
    const headingSine = Math.sin(runnerHeadingRadians);
    const frame: SceneFrame = Object.freeze({
      time: this.time,
      distance: worldOriginDistance,
      travelDistance: this.distance,
      rate: processingRate,
      visualSpeed,
      delta: isMotionReduced ? 0 : frameDeltaSeconds,
      reduced: isMotionReduced,
      centerX: roadCenterXAt,
      palette,
      near: roadStart,
      far: roadEnd,
      roadLight: (z: number) =>
        roadSurface(
          palette,
          worldOriginDistance + z,
          renewalFrontDistance,
          this.roadEffect,
        ).accent,
      projectPoint: orbit?.localPoint ?? ((point: Vec3): Vec3 => [...point]),
      view:
        stationaryFrame != null
          ? Object.freeze({
              ...pose,
              clearance: 24 + stationaryFrame.segmentLength * 0.1,
            })
          : null,
    });
    this.sceneRenderer.begin(
      viewportWidth,
      viewportHeight,
      palette,
      world.sky,
      this.time,
      fade,
      isMotionReduced,
      {
        view: viewMatrix,
        eye:
          orbit != null
            ? orbit.worldPoint(pose.eye)
            : [
                eye[0] + roadCenterOffsetAtDistance(worldOriginDistance),
                eye[1],
                eye[2] + worldOriginDistance,
              ],
        fov: fieldOfViewRadians,
      },
    );
    this.vertices = [];
    this.particles = [];
    this.glass = [];
    this.worldTransform = orbit?.localPoint ?? null;
    this.pluginHost ??= new PluginInstanceHost({
      world: this.sceneRenderer.worldRoot,
      runner: this.sceneRenderer.runnerRoot,
    });
    this.pluginHost.draw('world', world, this.geometry, frame);
    if (world.road) {
      const roadOptions = {
        distance: worldOriginDistance,
        front: renewalFrontDistance,
        centerX: roadCenterXAt,
        palette,
        near: roadStart,
        far: roadEnd,
        effect: this.roadEffect,
      };
      if (orbit != null) {
        this.worldTransform = null;
        drawRoad(
          {
            quad: (
              firstVertex,
              secondVertex,
              thirdVertex,
              fourthVertex,
              color,
              unlit,
            ) =>
              this.quad(
                orbit.localPoint(firstVertex),
                orbit.localPoint(secondVertex),
                orbit.localPoint(thirdVertex),
                orbit.localPoint(fourthVertex),
                color,
                unlit,
              ),
          },
          roadOptions,
        );
        this.worldTransform = orbit.localPoint;
      } else {
        drawRoad(this.geometry, roadOptions);
      }
      const shadowBase = roadSurface(
        palette,
        renewalFrontDistance,
        renewalFrontDistance,
        this.roadEffect,
      ).road;
      // Contact shadow under the hovering mascot grounds it in the scene.
      for (let ring = 0; ring < 10; ring++) {
        const inner = ring / 10;
        const outer = (ring + 1) / 10;
        const color = shadowBase.map(
          (v) => v * (0.53 + 0.4175 * outer),
        ) as unknown as Color;
        const point = (angle: number, r: number): Vec3 => [
          runnerX +
            runnerDefinition.offset[0] +
            Math.cos(angle) * r * 1.8 * runnerDefinition.scale,
          0.032,
          runnerZ +
            runnerDefinition.offset[2] +
            Math.sin(angle) * r * 1.25 * runnerDefinition.scale,
        ];
        for (let segment = 0; segment < 32; segment++) {
          const a = (segment / 32) * Math.PI * 2;
          const b = ((segment + 1) / 32) * Math.PI * 2;
          this.quad(
            point(a, inner),
            point(a, outer),
            point(b, outer),
            point(b, inner),
            color,
            true,
          );
        }
      }
    }
    const bob = Math.sin(this.time * 2) * runnerDefinition.bob;
    const roll = Math.sin(this.time * 0.8) * runnerDefinition.roll;
    const rollCosine = Math.cos(roll);
    const rollSine = Math.sin(roll);
    this.transform = ([x, y, z]) => {
      const rollX = x * rollCosine - y * rollSine;
      const rollY = x * rollSine + y * rollCosine;
      return [
        runnerX +
          runnerDefinition.offset[0] +
          runnerDefinition.scale * (rollX * headingCosine + z * headingSine),
        runnerDefinition.offset[1] + bob + runnerDefinition.scale * rollY,
        runnerZ +
          runnerDefinition.offset[2] +
          runnerDefinition.scale * (-rollX * headingSine + z * headingCosine),
      ];
    };
    this.sceneRenderer.placeRunner?.((point) => this.projectPoint(point));
    this.particleScale = runnerDefinition.scale;
    try {
      this.pluginHost.draw('runner', runnerDefinition, this.geometry, frame);
    } finally {
      this.transform = null;
      this.particleScale = 1;
    }
    this.worldTransform = null;
    this.sceneRenderer.draw(
      this.vertices,
      viewMatrix,
      projectionMatrix,
      palette,
      fade,
      Math.max(
        world.path?.fogDistance ?? 360,
        (stationaryFrame?.segmentLength ?? 0) * 1.2,
      ),
      this.particles,
      this.glass,
    );
  }
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    try {
      this.pluginHost?.dispose();
    } finally {
      this.sceneRenderer.dispose();
    }
  }
}
