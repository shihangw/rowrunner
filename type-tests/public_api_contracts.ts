import {ProgressSink, RateSmoother, type ProgressSample} from 'rowrunner';
import {RoadScene, type SceneOptions, type Vec3} from 'rowrunner/scene';
import {defineWorld, defineRunner, disposeObject3D} from 'rowrunner/plugins';
import {drawRoad} from 'rowrunner/geometry';
import {createProgressServer} from 'rowrunner/server';
import {Group} from 'three';
import type {z} from 'zod';
import type {WorldPluginSchema} from 'rowrunner/schemas';
import {ProgressSampleSchema, SceneOptionsSchema} from 'rowrunner/schemas';

const isoSample: z.input<typeof ProgressSampleSchema> = {
  runId: 'migration',
  completed: 0,
  timestamp: '2026-09-24T12:00:00Z',
};
const parsedSample = ProgressSampleSchema.parse(isoSample);
parsedSample.timestamp.toFixed();
// @ts-expect-error parsed timestamps are normalized numbers
parsedSample.timestamp.toUpperCase();

const sample: ProgressSample = {
  runId: 'migration',
  completed: 500,
  timestamp: Date.now(),
};
const sink = new ProgressSink();
const result = sink.push(sample);
if (result.accepted) {
  result.sample.completed.toFixed();
}
const smoother = new RateSmoother();
const world = defineWorld({
  id: 'world',
  draw(mesh, frame) {
    const point: Vec3 = frame.projectPoint([0, 0, 0]);
    mesh.box(...point, 1, 2, 3, frame.palette.accent);
  },
});
const runner = defineRunner({
  id: 'runner',
  create() {
    const object = new Group();
    return {
      object,
      update(frame) {
        object.rotation.y += frame.delta;
      },
      dispose() {
        disposeObject3D(object);
      },
    };
  },
});
const options: SceneOptions = {worlds: [world], runners: [runner]};
const parsedOptions: SceneOptions = SceneOptionsSchema.parse(options);
const parsedWorld: z.infer<typeof WorldPluginSchema> = world;
void [parsedOptions, parsedWorld];
function mount(canvas: HTMLCanvasElement) {
  const scene = new RoadScene(canvas, options);
  scene.render(smoother.step(sink.snapshot().targetRate, 1 / 60), 1 / 60);
  scene.setRunner(runner.id);
  scene.dispose();
}
// Validate the generated declarations reject invalid public input.
// @ts-expect-error completed is a numeric cumulative count
sink.push({...sample, completed: '500'});
// @ts-expect-error RGB colors have exactly three components
defineWorld({id: 'bad', draw() {}, palette: {accent: [1, 0]}});
// @ts-expect-error unsupported camera mode
const badOptions: SceneOptions = {camera: 'top-down'};
// @ts-expect-error factories must return synchronously
defineRunner({id: 'async', create: async () => ({object: new Group()})});
void [drawRoad, createProgressServer, mount, badOptions];
