# Worlds, runners, and cameras

[Back to Rowrunner](../README.md) · [Progress inputs](progress.md)

The [TypeScript example](../examples/README.md) includes seven worlds and four
runners to try, copy, or adapt. The core library supplies the renderer and
extension API; applications supply their content.

## Create a scene

Define content in your own files and pass it directly:

```ts
import {RoadScene} from '@shihangw/rowrunner/scene';
import {myWorld} from './worlds/my-world/my_world.js';
import {myRunner} from './runners/my-runner/my_runner.js';

const scene = new RoadScene(canvas, {
  worlds: [myWorld],
  runners: [myRunner],
  world: myWorld.id, // Omit to select the first entry.
  runner: myRunner.id,
  camera: 'cinematic',
  roadEffect: 'renewal',
});
scene.render(500, 1 / 60);
// On unmount:
scene.dispose();
```

`defineWorld()` and `defineRunner()` from `@shihangw/rowrunner/plugins` create typed
JavaScript definitions. A definition supplies an ID, optional metadata, and a
`create()` factory or `draw(geometry, frame)` callback. The term "plugin" describes
this extension interface; no external installation or global registry is needed.

Each instance must have at least one world and runner. There are no implicit
fallbacks or reserved content IDs. IDs are unique within their kind. `preset`
can inherit another definition supplied by the application; missing references
and cycles throw. Content may appear in any order. `plugins: [...]` is an
optional registration API if you prefer separate ID-only selection arrays.

Factories are synchronous and lazy, with independent state for each RoadScene.
They return `object` (a native Three.js object tree), `draw`, or both, plus
optional `update(frame)`, `onEnter(frame)`, `onExit()`, and `dispose()` hooks.
Updates run only while active. Re-entering a world/runner reuses its instance.
Disposal exits active content and releases all created instances, even when a
cleanup hook fails. Preload external assets before creating the visualization.

Worlds accept partial RGB `palette` overrides, `road: false` to hide the road,
a `sky` fragment shader with per-frame uniforms, and an optional `path` adapter
for curved coordinate systems. The default sky is a simple palette gradient.
Worlds may also supply a `music` score. A score has a tempo in beats per minute,
32 eighth-note `melody` positions (MIDI pitches or `null` rests), four `bass`
pitches, and four three-note `chords`. Optional `wave` selects the lead's
oscillator shape, `instrument: 'organ'` gives the lead and chords a sustained
pipe-organ voice, `echo: true` adds a spacious delay, and `volume` sets that
world's mix level. The score loops
while its world is active; manual and scheduled world changes crossfade the
music. Worlds without a score are silent; `music: null` silences an inherited
score. Set `src` to a same-origin audio file URL to play a recorded loop for
that world. The procedural score plays until the file is decoded and remains
the fallback if it cannot load. For a Vite app, use a static
`new URL('./music.mp3', import.meta.url).href` as `src`; Vite includes the file
in the build. Call
`await scene.setMusicEnabled(true)` from a click or other user gesture to start
audio; it is off by default. Use `scene.setMusicEnabled(false)` to stop it, and
`scene.musicEnabled` to read the current setting. `scene.dispose()` closes its
audio context along with its rendering resources. The example's seven worlds
bundle CC0 recorded tracks with original procedural scores as fallbacks, and
its Customize panel has a music toggle.

```ts
const myWorld = defineWorld({
  id: 'my-world',
  draw(geometry, frame) {
    // Draw scenery here.
  },
  music: {
    tempo: 96,
    melody: Array.from({length: 32}, (_, step) => (step % 4 === 0 ? 72 : null)),
    bass: [48, 45, 50, 48],
    chords: [
      [60, 64, 67],
      [57, 60, 64],
      [62, 65, 69],
      [60, 64, 67],
    ],
    wave: 'sine',
  },
});
```

Example-specific planets, storms, black holes, and model catalogs are outside
the library. `@shihangw/rowrunner/geometry` exports road drawing helpers for custom paths.

Runners accept `forwardAxis`, `scale`, `offset`, `bob`, and `roll`. The renderer
aligns their authored front with forward travel in every camera. Geometry
callbacks can draw primitives, particles, glass facets, or explicit `ModelData`
using `geometry.model(data, position, scale)`; model names are not built into
the library. Native Three.js content is the recommended route for loaded models.

`frame` includes animation `time`, `delta` (seconds capped at .05), source `rate`,
`visualSpeed`, `travelDistance`, floating-origin `distance`, `near`/`far` bounds,
`palette`, `centerX(z)`, `roadLight(z)`, `projectPoint(point)`, and `reduced`.
Time, delta, and travel freeze under reduced motion. Confirmed progress is never
inferred from visual movement.

`setWorld()` / `setRunner()` change content without resetting progress.
`scene.worlds` / `scene.runners` expose the configured catalogs. Legacy
scene/protagonist/mascot aliases remain supported; conflicting aliases throw.

Cameras: `cinematic`, `chase`, `approach`, `side`, `aerial`, `stationary`.
Cinematic mode shuffles all ten compositions once per cycle. With automatic
world changes enabled, `worldSwitchIntervalSeconds` schedules a new world every
20 seconds by default. Cinematic mode waits for the next completed shot, then
fades out, swaps world and camera together, and fades in. Other camera modes
fade to the next world when the interval expires. The schedule pauses while
progress is stopped, completed, or reduced motion is active. Passing views hold
for at least six seconds. `render(rate, dt, { completed: true })` temporarily
uses the approaching camera. `CompletionCelebration` from `@shihangw/rowrunner/scene`
provides the persistent configurable heading and looping confetti.

The default logarithmic speed curve maps 100 events/s to 40 scene units/s while
keeping large rates legible. Set `speedScale: 'linear'` to opt out. For a slower
stream, set `visualRateMultiplier: 12.5` so 8/s moves exactly like 100/s at the
default setting. The multiplier defaults to 1 and can be changed at runtime
with `scene.setVisualRateMultiplier(12.5)`. It scales only the rate used for
scene travel; the reported events/second stays exact. `roadEffect: 'renewal'`
lights and polishes the road behind the runner. These are decorative effects;
progress totals and timestamps remain exact.

### Native Three.js content and GLB models

The scene now runs on `THREE.WebGLRenderer` with a Three.js scene graph, cameras,
render targets, buffer geometry, and materials. Existing procedural drawing
callbacks remain supported; native plugins can return any `THREE.Object3D`,
including groups, instanced meshes, lights, or loaded glTF scenes. The default
scene provides hemisphere and directional lighting, fog, and post-processing.
`scene.renderer`, `scene.threeScene`, and `scene.threeCamera` expose the underlying
Three.js objects for integrations and diagnostics. Rowrunner owns the render
loop's camera pose and render targets; call `scene.render()` as before.

```js
import * as THREE from 'three';
import {defineRunner, disposeObject3D} from '@shihangw/rowrunner/plugins';

export const myRunner = defineRunner({
  id: 'crystal',
  name: 'Crystal',
  forwardAxis: '+z',
  create() {
    const object = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.2, 1),
      new THREE.MeshStandardMaterial({
        color: 0x77ccff,
        metalness: 0.4,
        roughness: 0.22,
        emissive: 0x225588,
        emissiveIntensity: 0.3,
      }),
    );
    return {
      object,
      update({delta}) {
        object.rotation.y += delta * 0.3;
      },
      dispose() {
        disposeObject3D(object);
      },
    };
  },
});
```

Create a fresh object tree per `create()` call. Rowrunner mounts it while active,
detaches it on exit, and reuses it on re-entry. Runner objects use local model
coordinates; their parent receives the configured position, forward orientation,
scale, bob, roll, and orbital transform. World objects use the current floating
origin: update their placement using `frame.distance` and `frame.centerX(z)`.
`frame.projectPoint([x,y,z])` converts road coordinates to the render frame,
including Binary Eclipse's orbit. Use `frame.near`/`far` for coverage; avoid
rebuilding geometry and materials every frame. Native worlds can use instancing,
LOD, textures, and their own lights.

For GLB/glTF assets, use Three.js's standard addon loader. Load before creating
the visualization; plugin factories stay synchronous:

```js
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {AnimationMixer} from 'three';
import {defineRunner, disposeObject3D} from '@shihangw/rowrunner/plugins';

const asset = await new GLTFLoader().loadAsync('/models/runner.glb');
const modelRunner = defineRunner({
  id: 'model-runner',
  name: 'My model',
  forwardAxis: '+z',
  create() {
    const object = clone(asset.scene);
    const mixer = new AnimationMixer(object);
    if (asset.animations[0]) mixer.clipAction(asset.animations[0]).play();
    return {
      object,
      update({delta}) {
        mixer.update(delta);
      },
      dispose() {
        mixer.stopAllAction();
        mixer.uncacheRoot(object);
        // SkeletonUtils creates independent skeletons, but shares mesh assets.
        const skeletons = new Set();
        object.traverse((node) => {
          if (node.skeleton) skeletons.add(node.skeleton);
        });
        for (const skeleton of skeletons) skeleton.dispose();
      },
    };
  },
});
// Pass modelRunner in plugins and select runner: 'model-runner'.
// After ALL visualizations using this asset have been disposed:
// disposeObject3D(asset.scene);
```

Plugins own their GPU assets and should release them in `dispose()`.
`disposeObject3D()` releases each geometry, material, texture, and skeleton in an
exclusively owned tree once. It also releases instanced-mesh instance buffers.
Do not call it on a clone whose resources are shared with a still-active scene;
release shared assets through their original owner once all consumers finish.
The example's native definitions illustrate both instanced scenery and lit characters.

Three.js and its types are declared package dependencies. The TypeScript example uses Vite to resolve normal package imports; no CDN
or import map is required.
A modern browser with WebGL 2 is required. The progress estimator and HTTP sink
still run without a DOM or renderer. The authored palettes use a linear output
pipeline with no tone mapping to preserve the existing visual appearance.
