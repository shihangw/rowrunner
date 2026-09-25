import { z } from 'zod';

export const RunStatusSchema = z.enum(['running', 'paused', 'completed', 'failed']);
export const ProgressStateSchema = z.enum([
  ...RunStatusSchema.options,
  'waiting',
  'warming',
  'stalled',
  'stale',
]);
export const RunIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const count = z.number().int().nonnegative();
const epoch = count.max(8640000000000000);

/** Epoch milliseconds or an ISO timestamp with an explicit timezone; parsed to milliseconds. */
export const TimestampSchema = z.union([
  epoch,
  z
    .string()
    .regex(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/)
    .transform(Date.parse)
    .pipe(epoch),
]);
export const ProgressSampleSchema = z.object({
  runId: RunIdSchema,
  completed: count,
  timestamp: TimestampSchema,
  /** Omission retains the previous target; null explicitly clears it. */
  targetTotal: count.nullable().optional(),
  status: RunStatusSchema.optional(),
  label: z.string().max(120).optional(),
  unit: z.string().min(1).max(24).optional(),
});
export const NormalizedSampleSchema = ProgressSampleSchema.required().extend({ timestamp: epoch });
export const SinkOptionsSchema = z.object({
  windowMs: z.number().positive().default(20000),
  staleAfterMs: z.number().positive().default(30000),
  idleAfterMs: z.number().positive().default(10000),
  futureToleranceMs: z.number().positive().default(5000),
});
export const SmootherOptionsSchema = z.object({
  riseSeconds: z.number().positive().default(1.2),
  fallSeconds: z.number().positive().default(1.8),
});
export const ProgressSnapshotSchema = z.object({
  runId: RunIdSchema.optional(),
  timestamp: epoch.optional(),
  label: z.string().max(120).optional(),
  unit: z.string().min(1).max(24).optional(),
  status: RunStatusSchema.optional(),
  state: ProgressStateSchema,
  completed: count,
  targetTotal: count.nullable(),
  /** Raw window estimate. Null until two usable samples exist. May be historical when stale. */
  rate: z.number().nonnegative().nullable(),
  /** Current target for animation; zero when paused, stale, stopped, or terminal. */
  targetRate: z.number().nonnegative(),
  progress: z.number().min(0).max(1).nullable(),
  etaSeconds: z.number().nonnegative().nullable(),
  ageMs: z.number().nonnegative().nullable(),
  resetCount: count,
});
export const PushResultSchema = z.discriminatedUnion('accepted', [
  z.object({
    accepted: z.literal(true),
    reason: z.enum(['new-run', 'update', 'counter-reset']),
    sample: NormalizedSampleSchema,
  }),
  z.object({
    accepted: z.literal(false),
    reason: z.enum(['duplicate', 'out-of-order', 'timestamp-conflict', 'terminal-run']),
  }),
]);
