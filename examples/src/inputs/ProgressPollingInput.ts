import { z } from 'zod';
import { ProgressSampleSchema, type ProgressSample } from 'rowrunner';

const PollingTimingSchema = z.object({
  intervalMilliseconds: z.number().int().positive().default(2_000),
  timeoutMilliseconds: z.number().int().positive().default(8_000),
});
interface ProgressPollingOptions extends z.input<typeof PollingTimingSchema> {
  readSample(signal: AbortSignal): Promise<ProgressSample>;
  onSample(sample: ProgressSample): void;
  onError(error: unknown): void;
}

/** Read immediately, then on a fixed timer. Stop cancels the timer and any pending request. */
export function startProgressPolling(options: ProgressPollingOptions): () => void {
  const { intervalMilliseconds, timeoutMilliseconds } = PollingTimingSchema.parse(options);
  let isStopped = false;
  let activeRequest: AbortController | undefined;

  async function poll() {
    if (isStopped || activeRequest) return;
    const request = new AbortController();
    activeRequest = request;
    const timeout = setTimeout(
      () => request.abort(new Error('Progress request timed out')),
      timeoutMilliseconds,
    );
    try {
      const sample = ProgressSampleSchema.parse(await options.readSample(request.signal));
      if (!isStopped && !request.signal.aborted) options.onSample(sample);
    } catch (error) {
      if (!isStopped) options.onError(error);
    } finally {
      clearTimeout(timeout);
      activeRequest = undefined;
    }
  }

  const timer = setInterval(() => void poll(), intervalMilliseconds);
  void poll();
  return () => {
    isStopped = true;
    clearInterval(timer);
    activeRequest?.abort();
  };
}
