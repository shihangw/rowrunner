# Rowrunner

Turn cumulative progress into smooth live speed estimates and a Three.js scene.
Written in strict TypeScript and published as ESM JavaScript with generated declarations. The estimator and Node
HTTP sink run without a browser. The renderer requires WebGL 2.

**The package contains no worlds, runners, or model assets.** Applications supply
their own content. All demo content lives in the [TypeScript example](examples/README.md).

## Run the example

Requires Node 22+:

```sh
npm install
npm start
```

Open http://127.0.0.1:3000. The example includes the HUD, simulated progress,
HTTP/SSE input, seven procedural worlds, and four runners.
`examples/src/main.ts` starts the app; edit `examples/src/ExampleConfiguration.ts` to choose
content. Run `npm run producer --workspace examples` to send live input.

**Live input** defaults to public Solana transaction totals, fetched immediately
and every 10 seconds. Select **Custom progress** for your own HTTP/SSE producer.
The polling adapter lives in the example; it sends validated samples to the same
progress sink and stops polling when you switch inputs.

## Package API

The package name is `rowrunner`. It has not been published yet; install the
local tarball with `npm install ./rowrunner-0.1.0.tgz` after running `npm pack`:

```js
import { ProgressSink, RateSmoother } from 'rowrunner';

const sink = new ProgressSink({
  windowMs: 20_000,
  staleAfterMs: 30_000,
  idleAfterMs: 10_000,
});
const speed = new RateSmoother({ riseSeconds: 1.2, fallSeconds: 1.8 });
const now = Date.now();

sink.push({ runId: 'migration', completed: 10_000, timestamp: now - 2000 });
sink.push({ runId: 'migration', completed: 11_000, timestamp: now });
console.log(sink.snapshot().rate); // 500 units/second

// In your animation loop, use a monotonic delta measured in seconds:
const visualRate = speed.step(sink.snapshot().targetRate, 1 / 60);
```

`push(sample, receivedAt = Date.now())` validates and normalizes the sample.
Invalid data throws `TypeError`. Valid-but-ignored data returns
`{ accepted: false, reason }`. Accepted updates return a normalized `sample`.
`snapshot(now = Date.now())` derives state without mutating confirmed counts.
Use `rate` for the measured window estimate and `targetRate` to drive animation.
Use `RateSmoother` only for presentation. Do not integrate it to invent progress.

### Zod schemas and inferred types

Public data types are inferred from Zod schemas, which also validate input to the
sink and world/runner definitions. Import schemas from `rowrunner/schemas`, or
from the corresponding `rowrunner`, `rowrunner/scene`, and `rowrunner/plugins` entrypoints.

```ts
import { z } from 'zod';
import { ProgressSampleSchema, SceneOptionsSchema } from 'rowrunner/schemas';

type SampleInput = z.input<typeof ProgressSampleSchema>; // number or ISO timestamp
type ParsedSample = z.output<typeof ProgressSampleSchema>; // timestamp is a number
type Options = z.infer<typeof SceneOptionsSchema>;

const result = ProgressSampleSchema.safeParse(untrustedPayload);
if (result.success) sink.push(result.data);
else console.error(result.error.issues);
```

Schemas validate structure and normalize timestamps without filling in progress
metadata. The sink still handles target retention, future timestamps, ordering,
counter resets, and completion. Unknown object fields are stripped; palette keys
are strict to catch misspelled colors. Only `targetTotal` accepts `null`.
`SinkOptionsSchema` and `SmootherOptionsSchema` supply timing defaults.

`SceneDefinitionSchema`, `ProtagonistDefinitionSchema`, `WorldPluginSchema`,
`RunnerPluginSchema`, and `SceneOptionsSchema` validate configuration shapes.
Preset lookup, alias conflicts, and duplicate IDs are checked by `RoadScene`.
Callback signatures and Three.js objects retain TypeScript interfaces. Callback
schemas check that values are functions without wrapping or invoking them;
factory return values are checked when instances are created.

Direct schema parsing uses standard Zod errors. The library's validation methods
preserve their `TypeError` contract, with a `ZodError` in `error.cause` for schema
failures. Schemas do not add validation to the per-frame geometry loop.

### Input contract

```json
{
  "runId": "migration",
  "completed": 12500,
  "timestamp": "2026-09-23T18:00:00Z",
  "targetTotal": 250000,
  "status": "running",
  "label": "Customer migration",
  "unit": "rows"
}
```

| Field           | Meaning                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `runId`         | Required. 1–80 letters, digits, underscores, or hyphens. A new ID starts a new run.                 |
| `completed`     | Required cumulative count, a nonnegative safe integer. Not a per-poll delta.                        |
| `timestamp`     | Required measurement time: integer epoch **milliseconds**, or ISO with timezone.                    |
| `targetTotal`   | Optional safe integer. Omission retains the target; `null` clears it. Zero is a valid empty target. |
| `status`        | Optional `running` (default), `paused`, `completed`, or `failed`.                                   |
| `label`, `unit` | Optional display metadata, retained when omitted. Defaults to run ID and `rows`.                    |

Use the timestamp of the metric measurement, not the time you fetched it.
Choose `staleAfterMs` above your reporting interval and normal ingestion delay.
The demo and HTTP sink both default to 30 seconds. With Datadog or another
source, an adapter should convert its counter into this contract; no vendor
credentials or vendor-specific fetching are included.

### Estimation and edge cases

- **First sample:** unknown rate (`null`), warming state, no guessed movement.
- **Irregular intervals:** count delta / elapsed time over a trailing 20-second
  window. Interpolate the count at the window boundary, rather than averaging
  per-sample rates. Samples are capped at 2,048 entries.
- **Duplicates:** ignored without renewing freshness. Equal timestamps with
  different payloads and older timestamps are rejected without mutation.
- **Counter decrease:** rebase to the new count, clear rate history, increment
  `resetCount`, and warm up again. This is a reset, never negative speed.
- **New run ID:** clears history, target, metadata, and reset count. A sink
  tracks one run; use separate sinks for concurrent producers.
- **Fresh but unchanged counts:** after 10 seconds of sampled inactivity, state
  becomes `stalled`, and the visual speed decays toward zero.
- **No fresh measurement:** after 30 seconds, state becomes `stale`, ETA becomes
  unknown, and animation eases to a stop. Re-fetching an old sample cannot
  keep the display moving. `rate` may still contain a historical estimate;
  `targetRate` is zero. The demo shows a dash for stale throughput.
- **Long gaps and resume:** clear history to avoid bridging downtime with a
  misleading rate. The next usable pair establishes pace again.
- **Pause/failure/completion:** zero target speed immediately; visual speed
  decelerates smoothly. Terminal runs reject further updates. Use a new ID to
  restart. A running sample at or beyond a known target auto-completes.
- **Unknown target:** no percent or ETA. Explicit completion still works.
- **Over target:** preserve the real count, clamp progress at 100%.
- **Bad clocks:** reject timestamps more than five seconds in the future;
  source and receipt ages both contribute to freshness.
- **Frame rate / background tabs:** exponential damping is frame-rate
  independent. The road caps simulation frame time to avoid a giant jump when
  a tab becomes visible. Confirmed telemetry continues independently.

Snapshot states: `waiting`, `warming`, `running`, `stalled`, `stale`, `paused`,
`completed`, `failed`. `etaSeconds` is an estimate from the current window,
not a completion promise. It is `null` without a known target and usable rate.

### Worlds and runners are application content

Define content in your own files and pass it directly:

```ts
import { RoadScene } from 'rowrunner/scene';
import myWorld from './worlds/my-world/MyWorld.js';
import myRunner from './runners/my-runner/MyRunner.js';

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

`defineWorld()` and `defineRunner()` from `rowrunner/plugins` create typed
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
Example-specific planets, storms, black holes, and model catalogs are outside
the library. `rowrunner/geometry` exports road drawing helpers for custom paths.

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
uses the approaching camera. `CompletionCelebration` from `rowrunner/scene`
provides the persistent configurable heading and looping confetti.

The default logarithmic speed curve makes 80/s feel fast while keeping large
rates legible. Set `speedScale: 'linear'` to opt out. `roadEffect: 'renewal'`
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
import { defineRunner, disposeObject3D } from 'rowrunner/plugins';

export default defineRunner({
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
      update({ delta }) {
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
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationMixer } from 'three';
import { defineRunner, disposeObject3D } from 'rowrunner/plugins';

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
      update({ delta }) {
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

### Minimal Node sink

```js
import { createProgressServer } from 'rowrunner/server';

const server = createProgressServer();
server.listen(3000, '127.0.0.1');
```

Endpoints:

- `POST /api/runs/:runId/progress` — JSON sample; run ID comes from the URL.
- `GET /api/runs/:runId/progress` — current derived snapshot.
- `GET /api/runs/:runId/events` — SSE stream of accepted samples. Sends the
  latest sample on connection and heartbeats every 15 seconds. A new subscriber
  needs another sample to calculate rate; history is not replayed.

```sh
curl -X POST http://127.0.0.1:3000/api/runs/migration/progress \
  -H 'Content-Type: application/json' \
  -d "{\"completed\":1000,\"timestamp\":$(node -p 'Date.now()')}"
# Send another sample with a larger count a few seconds later.
```

HTTP 200 means accepted or duplicate. HTTP 409 means stale order, timestamp
conflict, terminal run, or run limit. Invalid payloads return 400, oversized
bodies return 413, and non-JSON requests return 415. The server holds up to 100
runs and 100 SSE listeners in memory, with a 16 KiB request limit. Restarting
clears everything. It rejects cross-origin browser requests and has **no
authentication or persistent storage**; the example binds only to loopback.
Put it behind an authenticated service before exposing it beyond your machine.
Optional `assets` is an explicit map of URL paths to file/MIME pairs; see the
example server. No arbitrary filesystem paths are served.

## Verify and package

Source naming follows Swift's [API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/):
prefer clarity at the call site, describe each value's role, and avoid unnecessary
abbreviations. Use PascalCase filenames for a primary type or responsibility
(`ProgressSink.ts`, `SceneRenderer.ts`), lowerCamelCase variables and functions,
`is`/`has` prefixes for boolean state, and explicit units where useful
(`deltaSeconds`, `fieldOfViewRadians`). Keep conventional entrypoints such as
`main.ts` and package `index.ts`, and standard mathematical coordinates such as
`x`, `y`, and `z`.

Example content uses `<Name>World.ts`, `<Name>Runner.ts`, `<Name>Geometry.js`,
and `<Name>SkyShader.js` within each world's or runner's folder. Public npm
imports such as `rowrunner/scene` remain independent of source filenames.

```sh
npm run build
npm test
npm run typecheck
npm run build:example
npm pack
```

The npm tarball includes compiled ESM and generated declarations in `dist/`,
TypeScript sources in `src/` for source-map navigation, this README, and the license. Examples,
Kenney assets, and development tools are not included. The progress API stays
available from `rowrunner`, rendering from `rowrunner/scene`, extension helpers
from `rowrunner/plugins`, and the HTTP sink from `rowrunner/server`.

The library's `tsconfig.json` enables strict checking and emits JavaScript,
`.d.ts` declarations, and source maps. Package exports point to `dist/`; no
TypeScript loader is needed by consumers. `npm pack` builds and runs regression
and public-type checks before packaging. Declaration files are generated rather
than maintained separately. Example start/build commands build the library first.
