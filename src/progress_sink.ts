import type {
  ProgressSample,
  NormalizedSample,
  PushResult,
  ProgressSnapshot,
  ProgressState,
  SinkOptions,
  SmootherOptions,
} from './progress_data_types.js';
export type * from './progress_data_types.js';
export * from './progress_data_schemas.js';
import {
  ProgressSampleSchema,
  SinkOptionsSchema,
  SmootherOptionsSchema,
} from './progress_data_schemas.js';
import {parseInput} from './input_validation.js';

/** A source-independent cumulative-progress sink. Times and durations are milliseconds. */
export class ProgressSink {
  private readonly windowMs: number;
  private readonly staleAfterMs: number;
  private readonly idleAfterMs: number;
  private readonly futureToleranceMs: number;
  private samples: NormalizedSample[] = [];
  private _latest: NormalizedSample | null = null;
  private _receivedAt: number | null = null;
  private lastAdvance: number | null = null;
  private resetCount = 0;
  get latest() {
    return this._latest;
  }
  get receivedAt() {
    return this._receivedAt;
  }
  constructor(options: SinkOptions = {}) {
    const {windowMs, staleAfterMs, idleAfterMs, futureToleranceMs} = parseInput(
      SinkOptionsSchema,
      options,
    );
    this.windowMs = windowMs;
    this.staleAfterMs = staleAfterMs;
    this.idleAfterMs = idleAfterMs;
    this.futureToleranceMs = futureToleranceMs;
    this.samples = [];
    this._latest = null;
    this._receivedAt = null;
    this.lastAdvance = null;
    this.resetCount = 0;
  }

  push(progressSample: ProgressSample, receivedAt = Date.now()): PushResult {
    if (!Number.isFinite(receivedAt)) {
      throw new TypeError('Invalid receipt time');
    }
    const validatedSample = parseInput(ProgressSampleSchema, progressSample);
    const {runId, completed, timestamp} = validatedSample;
    if (timestamp > receivedAt + this.futureToleranceMs) {
      throw new TypeError('timestamp is too far in the future');
    }
    const previous = this.latest?.runId === runId ? this.latest : null;
    const targetTotal =
      validatedSample.targetTotal === undefined
        ? (previous?.targetTotal ?? null)
        : validatedSample.targetTotal;
    let status = validatedSample.status ?? 'running';
    if (
      status === 'running' &&
      targetTotal !== null &&
      completed >= targetTotal
    ) {
      status = 'completed';
    }
    const label = validatedSample.label ?? previous?.label ?? runId;
    const unit = validatedSample.unit ?? previous?.unit ?? 'rows';
    const sample: NormalizedSample = {
      runId,
      timestamp,
      completed,
      targetTotal,
      status,
      label,
      unit,
    };
    if (previous) {
      if (timestamp < previous.timestamp) {
        return {accepted: false, reason: 'out-of-order'};
      }
      if (timestamp === previous.timestamp) {
        const duplicate = (
          Object.keys(sample) as (keyof NormalizedSample)[]
        ).every((key) => sample[key] === previous[key]);
        return {
          accepted: false,
          reason: duplicate ? 'duplicate' : 'timestamp-conflict',
        };
      }
      if (previous.status === 'completed' || previous.status === 'failed') {
        return {accepted: false, reason: 'terminal-run'};
      }
    }
    const didCounterReset = previous && completed < previous.completed;
    const didResume =
      previous && previous.status !== 'running' && status === 'running';
    const hasLongSampleGap =
      previous && timestamp - previous.timestamp > this.staleAfterMs;
    if (!previous || didCounterReset || didResume || hasLongSampleGap) {
      this.samples = [];
      this.lastAdvance = timestamp;
      this.resetCount = previous
        ? this.resetCount + Number(didCounterReset)
        : 0;
    }
    if (previous && completed > previous.completed) {
      this.lastAdvance = timestamp;
    }
    this.samples.push(sample);
    const windowStartTimestamp = timestamp - this.windowMs;
    // Retain one sample before the window, so irregular intervals are time weighted.
    while (
      this.samples.length > 2 &&
      this.samples[1].timestamp <= windowStartTimestamp
    ) {
      this.samples.shift();
    }
    // Bound memory even if a producer sends sub-millisecond timestamps.
    if (this.samples.length > 2048) {
      this.samples.splice(1, this.samples.length - 2048);
    }
    this._latest = sample;
    this._receivedAt = receivedAt;
    return {
      accepted: true,
      reason: didCounterReset
        ? 'counter-reset'
        : !previous
          ? 'new-run'
          : 'update',
      sample,
    };
  }

  snapshot(currentTimestamp = Date.now()): ProgressSnapshot {
    if (!this.latest) {
      return {
        state: 'waiting',
        rate: null,
        targetRate: 0,
        completed: 0,
        targetTotal: null,
        progress: null,
        etaSeconds: null,
        ageMs: null,
        resetCount: 0,
      };
    }
    const latestSample = this.latest;
    const ageMs = Math.max(
      0,
      currentTimestamp - latestSample.timestamp,
      currentTimestamp - this.receivedAt!,
    );
    let rate: number | null = null;
    if (this.samples.length >= 2) {
      const firstSample = this.samples[0];
      const secondSample = this.samples[1];
      const windowStartTimestamp = Math.max(
        firstSample.timestamp,
        latestSample.timestamp - this.windowMs,
      );
      const windowStartFraction =
        (windowStartTimestamp - firstSample.timestamp) /
        (secondSample.timestamp - firstSample.timestamp);
      const countAtStart =
        firstSample.completed +
        (secondSample.completed - firstSample.completed) * windowStartFraction;
      rate = Math.max(
        0,
        (latestSample.completed - countAtStart) /
          ((latestSample.timestamp - windowStartTimestamp) / 1000),
      );
    }
    let state: ProgressState = latestSample.status;
    if (state === 'running') {
      if (ageMs >= this.staleAfterMs) {
        state = 'stale';
      } else if (rate === null) {
        state = 'warming';
      } else if (
        latestSample.timestamp - this.lastAdvance! >=
        this.idleAfterMs
      ) {
        state = 'stalled';
      }
    }
    const targetRate = state === 'running' ? (rate ?? 0) : 0;
    return {
      ...latestSample,
      state,
      rate,
      targetRate,
      ageMs,
      resetCount: this.resetCount,
      progress:
        latestSample.targetTotal === null
          ? null
          : latestSample.targetTotal === 0
            ? 1
            : Math.min(1, latestSample.completed / latestSample.targetTotal),
      etaSeconds:
        state === 'completed'
          ? 0
          : latestSample.targetTotal !== null && targetRate > 0
            ? Math.max(0, latestSample.targetTotal - latestSample.completed) /
              targetRate
            : null,
    };
  }
}

/** Frame-rate independent damping. Pass monotonic frame delta in seconds. */
export class RateSmoother {
  private readonly riseSeconds: number;
  private readonly fallSeconds: number;
  private _value = 0;
  get value() {
    return this._value;
  }
  constructor(options: SmootherOptions = {}) {
    const {riseSeconds, fallSeconds} = parseInput(
      SmootherOptionsSchema,
      options,
    );
    this.riseSeconds = riseSeconds;
    this.fallSeconds = fallSeconds;
  }
  step(target: number, deltaSeconds: number) {
    if (
      !Number.isFinite(target) ||
      target < 0 ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds < 0
    ) {
      return this.value;
    }
    const timeConstantSeconds =
      target > this.value ? this.riseSeconds : this.fallSeconds;
    this._value +=
      (target - this.value) * -Math.expm1(-deltaSeconds / timeConstantSeconds);
    if (target === 0 && this.value < 0.01) {
      this._value = 0;
    }
    return this.value;
  }
  reset() {
    this._value = 0;
  }
}
