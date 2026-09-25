# Rowrunner

**Make long-running work fun to watch.**

[Try the live Solana example](https://shihangw.github.io/rowrunner/) in your browser.

Rowrunner turns a stream of progress counts into a moving 3D world. Your migration
processes 500 rows a second; Bookie flies down a neon road, the speedometer shows
the pace, and the progress chart climbs toward completion. When the job finishes,
the camera moves in and the confetti keeps going.

[![Bookie flying through Neon Meridian with an integrated speedometer and progress chart](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/neon_meridian_bookie.jpg)](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/neon_meridian_bookie.jpg)

## Why use it?

A migration, backfill, or import can run for hours. Rowrunner gives that waiting
time something to look at—and makes changes in pace visible at a glance.

- **Watch a job run.** Put a migration, batch processor, or queue drain on a
  dashboard or shared screen. See it speed up, slow down, stall, and finish.
- **Bring a live counter to life.** Show ongoing activity without a fixed target.
  The example can follow public Solana transaction totals, polling every 2 seconds.
- **Make it yours.** Choose a world and protagonist, use your own Three.js models,
  and customize the completion message. The road can light up behind the runner
  as work gets done.

Send cumulative counts and timestamps; Rowrunner estimates throughput and smooths
movement between updates. It handles uneven reporting, counter resets, pauses,
and stale data. Confirmed counts stay exact; movement and speedometer effects are
presentation. A missing update never creates fictional progress.

## A few places to go

The example includes **seven worlds** and **four runners**: Bookie, Prism, Paper
Plane, and Survey Drone. Cinematic cameras rotate through tracking, approaching,
and passing views, with scheduled fades between worlds.

| Binary Eclipse · Prism                                                                                                                                                                                                                                                | Sea Storm · Bookie                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Prism traveling around two black holes with amber and blue halos](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/binary_eclipse_prism.jpg)](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/binary_eclipse_prism.jpg) | [![Bookie flying above a stormy sea](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/sea_storm_bookie.jpg)](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/sea_storm_bookie.jpg)                                                                     |
| **Matrix · Prism**                                                                                                                                                                                                                                                    | **Job complete · Bookie**                                                                                                                                                                                                                                                                         |
| [![Glowing Prism flying through Matrix's green data towers](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/matrix_prism.jpg)](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/matrix_prism.jpg)                          | [![Bookie celebrating a completed migration with a persistent Congrats message and confetti](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/completion_celebration.jpg)](https://raw.githubusercontent.com/shihangw/rowrunner/main/docs/images/completion_celebration.jpg) |

These screenshots were captured from the running demo with simulated migration
progress. Click an image to view it at full size.
Worlds and runners are ordinary application files, so adding one doesn't require
changing the library.

## Try it locally

You need **Node.js 22.13+** and a browser with **WebGL 2**.

```sh
git clone https://github.com/shihangw/rowrunner.git
cd rowrunner
npm ci
npm start
```

Open **http://127.0.0.1:3000**. One Node process serves the demo and its progress API.

- The demo starts automatically. Try **Cruise**, **Boost**, **Pause**, and **Finish**.
- Open **Customize** to change the world, runner, camera, and road effect.
- Choose **Live input → Solana transactions** for a public live counter.
- Choose **Live input → Custom progress** to connect your own job.

## Connect your progress

With the demo running, select **Live input → Custom progress**, keep the run ID
`migration`, and click **Connect**. In another terminal, start the sample producer:

```sh
npm run producer --workspace examples
```

For your own producer, send a cumulative count and its measurement time to the
same endpoint. `targetTotal` is optional:

```sh
curl http://127.0.0.1:3000/api/runs/migration/progress \
  -H 'Content-Type: application/json' \
  -d "{\"completed\":1000,\"targetTotal\":250000,\"timestamp\":$(node -p 'Date.now()')}"
```

Send another count with a newer timestamp to establish the rate, then keep
reporting while the job runs. Use a new run ID for a new job. For Datadog or another
metrics source, map the measured cumulative count and timestamp into this format.
See the [input contract and HTTP API](https://github.com/shihangw/rowrunner/blob/main/docs/progress.md#input-contract) for details.

## Use it in your app

Rowrunner is a TypeScript library with Three.js rendering and Zod-validated input.
You can use its progress estimator independently of the 3D scene:

```sh
npm install @shihangw/rowrunner
```

```ts
import {ProgressSink} from '@shihangw/rowrunner';

const progress = new ProgressSink();
const now = Date.now();

progress.push({runId: 'migration', completed: 1000, timestamp: now - 2000});
progress.push({runId: 'migration', completed: 2000, timestamp: now});

console.log(progress.snapshot().rate); // 500 rows/second
```

For a visual integration, start with the [TypeScript example](https://github.com/shihangw/rowrunner/blob/main/examples/README.md)
or [define your own world and runner](https://github.com/shihangw/rowrunner/blob/main/docs/scenes.md). The example supplies the
HUD and scene content; the core supplies the estimator, renderer, cameras, and
plugin API.

## Documentation

- [Example setup and customization](https://github.com/shihangw/rowrunner/blob/main/examples/README.md)
- [Progress inputs, rate estimation, and HTTP/SSE API](https://github.com/shihangw/rowrunner/blob/main/docs/progress.md)
- [Worlds, runners, cameras, and Three.js models](https://github.com/shihangw/rowrunner/blob/main/docs/scenes.md)
- [Contributing and development](https://github.com/shihangw/rowrunner/blob/main/CONTRIBUTING.md)

MIT licensed. Example scenery includes [Kenney assets under CC0](https://github.com/shihangw/rowrunner/blob/main/examples/THIRD_PARTY.md).
