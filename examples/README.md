# Rowrunner TypeScript example

A plain TypeScript app with Vite and a small Node server. The library is also
written in TypeScript; the example imports its compiled package exports. All worlds, runners,
sky shaders, and model assets belong to this project. Rowrunner supplies the
renderer, cameras, progress estimator, and sink.

From the repository root:

```sh
npm ci
npm start
```

Open http://127.0.0.1:3000. One process serves the app and `/api/runs/:id`.
The demo starts at 500 rows/second. The Customize panel switches worlds,
runners, cameras, road renewal, and automatic world changes.
Set `worldSwitchIntervalSeconds` in `src/example_configuration.ts` to change the
20-second world schedule. Cinematic mode waits for a shot boundary, fades out,
changes world and camera together, then fades in.

Choose **Live input → Solana transactions** to fetch finalized mainnet transaction
totals immediately and every **2 seconds**. The speed estimate appears after the
second sample. The example server proxies the public RPC; no API key is needed.
Failures leave the last confirmed count intact and retry on the next interval.
Switching inputs cancels the timer and pending request. **Custom progress** retains
the HTTP/SSE input for your own jobs.

The cumulative chart shows the latest 60 seconds. Its vertical bounds follow
recent counts, with headroom for ten seconds of measured growth. Full upper and
lower count labels keep small changes in large network totals readable.

The total is open-ended, so this source does not trigger completion. Its timestamp
is the observation time, since the RPC supplies a count without a measurement
timestamp. The public endpoint is rate-limited; it is intended for trying the example.
Source: [Solana getTransactionCount](https://solana.com/docs/rpc/http/gettransactioncount).

```sh
npm run typecheck --workspace examples
npm run build --workspace examples
npm run producer --workspace examples  # Choose Live input → Custom progress in the browser.
```

`build` emits the browser app into `dist/`; the HTTP sink is a separate Node API
when deploying that static build. `example_http_server.ts` is the local development server.
`@shihangw/rowrunner: file:..` links the library in this repository. In a separate app,
replace it with the published Rowrunner version.

## Files

- `src/main.ts`: application entrypoint.
- `src/example_configuration.ts`: world/runner selection and camera settings.
- `src/worlds/example_worlds.ts` / `src/runners/example_runners.ts`: ordinary arrays of content imports.
- `src/worlds/<name>/<name>_world.ts`: world definitions.
- `src/runners/<name>/<name>_runner.ts`: runner definitions.
- `src/progress_dashboard.ts` and `src/progress_history.ts`: HUD and live/demo controls.
- `src/inputs/progress_polling_input.ts`: cancellable polling with a 2-second default.
- `src/inputs/solana_transaction_source.ts`: server-side adapter for finalized network totals.
- `example_http_server.ts`: Vite and the progress API on one port.
- `example_progress_producer.ts`: sample HTTP producer.

The entrypoints and UI are strict TypeScript. Existing procedural geometry and
GLSL strings remain in adjacent JavaScript helpers (`allowJs`); these can be
replaced with native Three.js models without changing the library.

## Add a runner

Create `src/runners/my-runner/my_runner.ts`:

```ts
import {Mesh, SphereGeometry, MeshStandardMaterial} from 'three';
import {defineRunner, disposeObject3D} from '@shihangw/rowrunner/plugins';

export const myRunner = defineRunner({
  id: 'my-runner',
  name: 'My runner',
  create() {
    const object = new Mesh(
      new SphereGeometry(1, 32, 24),
      new MeshStandardMaterial({color: 0x77ccff}),
    );
    return {object, dispose: () => disposeObject3D(object)};
  },
});
```

Import `{myRunner}` in `src/runners/example_runners.ts` and add it to `runners`. Use `defineWorld()` and the
`worlds` array for scenery. No library edits, central registration service,
import maps, or separate plugin installation are needed.

Survey Drone demonstrates a native lit runner. The other examples preserve their
procedural geometry. A world may inherit another supplied world by ID with
`preset`. Dependencies can appear in any order in the array. All worlds and
runners are ordinary application content.

The demo preserves the cinematic camera cycle, continuous celebration, HUD,
road stripes and renewal, stable Binary Eclipse stars and orbital road, and
OS reduced-motion support. Confirmed counts remain separate from decorative
travel and speedometer jitter.

Kenney asset sources and licensing: [THIRD_PARTY.md](THIRD_PARTY.md).

The `predev`, `prebuild`, and `pretypecheck` hooks build the local library first.
After editing library source while the demo is running, run `npm run build`
from the repository root; Vite reloads the updated compiled modules.
