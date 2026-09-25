import type {PushResult} from '@shihangw/rowrunner';
// Chart confirmed source samples, independently of the smoothed speedometer.
export class ProgressHistory {
  points: {at: number; completed: number}[] = [];
  version = 0;
  constructor() {
    this.reset();
  }
  reset() {
    this.points = [];
    this.version = (this.version ?? 0) + 1;
  }
  add(result: PushResult) {
    if (!result.accepted) {
      return;
    }
    if (result.reason === 'new-run' || result.reason === 'counter-reset') {
      this.reset();
    }
    const {timestamp, completed} = result.sample;
    this.points.push({at: timestamp, completed});
    // Preserve the start and newest sample while bounding long-running sessions.
    if (this.points.length > 2048) {
      this.points = this.points.filter(
        (_, i, all) => i % 2 === 0 || i === all.length - 1,
      );
    }
    this.version++;
  }
  plot() {
    if (this.points.length === 0) {
      return {line: '', area: '', last: null, min: 0, max: 1, duration: 0};
    }

    const latestSample = this.points.at(-1)!;
    const windowStartTimestamp = Math.max(
      this.points[0].at,
      latestSample.at - 60_000,
    );
    const firstVisibleIndex = this.points.findIndex(
      (sample) => sample.at >= windowStartTimestamp,
    );
    const visibleSamples = this.points.slice(firstVisibleIndex);
    if (firstVisibleIndex > 0 && visibleSamples[0].at > windowStartTimestamp) {
      // Clip the segment crossing the window boundary; never add interpolated counts to history.
      const previousSample = this.points[firstVisibleIndex - 1];
      const nextSample = visibleSamples[0];
      const boundaryFraction =
        (windowStartTimestamp - previousSample.at) /
        (nextSample.at - previousSample.at);
      visibleSamples.unshift({
        at: windowStartTimestamp,
        completed:
          previousSample.completed +
          (nextSample.completed - previousSample.completed) * boundaryFraction,
      });
    }
    const firstSample = visibleSamples[0];
    const duration = latestSample.at - firstSample.at;
    const minimumCount = Math.min(
      ...visibleSamples.map((sample) => sample.completed),
    );
    const maximumCount = Math.max(
      ...visibleSamples.map((sample) => sample.completed),
    );
    const recentGrowthRate =
      duration > 0
        ? Math.max(
            0,
            (latestSample.completed - firstSample.completed) /
              (duration / 1000),
          )
        : 0;
    const countSpan = Math.max(10, maximumCount - minimumCount);
    const lowerPadding = Math.max(1, countSpan * 0.1);
    // Leave room for another ten seconds of measured growth, without changing plotted counts.
    const upperPadding = Math.max(lowerPadding, recentGrowthRate * 10);
    const desiredTickInterval = (countSpan + lowerPadding + upperPadding) / 4;
    const tickMagnitude = 10 ** Math.floor(Math.log10(desiredTickInterval));
    const tickMultiplier = [1, 2, 5, 10].find(
      (multiplier) => multiplier * tickMagnitude >= desiredTickInterval,
    )!;
    const tickInterval = Math.max(1, tickMultiplier * tickMagnitude);
    const lowerTickInterval = Math.max(
      1,
      10 ** Math.floor(Math.log10(lowerPadding)),
    );
    const min = Math.max(
      0,
      Math.floor((minimumCount - lowerPadding) / lowerTickInterval) *
        lowerTickInterval,
    );
    const max = Math.max(
      min + tickInterval,
      Math.ceil((maximumCount + upperPadding) / tickInterval) * tickInterval,
    );
    const coordinates = visibleSamples.map((sample) => [
      2 + ((sample.at - firstSample.at) / Math.max(1000, duration)) * 296,
      68 - ((sample.completed - min) / (max - min)) * 64,
    ]);
    const line = coordinates
      .map(
        ([x, y], index) =>
          `${index > 0 ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`,
      )
      .join(' ');
    const endpoint = coordinates.at(-1)!;
    return {
      line,
      area: `${line} L${endpoint[0].toFixed(2)},68 L${coordinates[0][0].toFixed(2)},68 Z`,
      last: endpoint,
      min,
      max,
      duration,
    };
  }
}
