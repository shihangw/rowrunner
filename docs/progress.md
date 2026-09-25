# Progress inputs and API

[Back to Rowrunner](../README.md) · [Worlds and runners](scenes.md)

Install the package with `npm install @shihangw/rowrunner`:

```js
import {ProgressSink, RateSmoother} from '@shihangw/rowrunner';

const sink = new ProgressSink({
  windowMs: 20_000,
  staleAfterMs: 30_000,
  idleAfterMs: 10_000,
});
const speed = new RateSmoother({riseSeconds: 1.2, fallSeconds: 1.8});
const now = Date.now();

sink.push({runId: 'migration', completed: 10_000, timestamp: now - 2000});
sink.push({runId: 'migration', completed: 11_000, timestamp: now});
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
sink and world/runner definitions. Import schemas from `@shihangw/rowrunner/schemas`, or
from the corresponding `@shihangw/rowrunner`, `@shihangw/rowrunner/scene`, and `@shihangw/rowrunner/plugins` entrypoints.

```ts
import {z} from 'zod';
import {
  ProgressSampleSchema,
  SceneOptionsSchema,
} from '@shihangw/rowrunner/schemas';

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

## Node HTTP sink

```js
import {createProgressServer} from '@shihangw/rowrunner/server';

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
