import type {z} from 'zod';
import type {
  RunStatusSchema,
  ProgressStateSchema,
  ProgressSampleSchema,
  NormalizedSampleSchema,
  SinkOptionsSchema,
  SmootherOptionsSchema,
  ProgressSnapshotSchema,
  PushResultSchema,
} from './progress_data_schemas.js';

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type ProgressState = z.infer<typeof ProgressStateSchema>;
export type ProgressSample = z.input<typeof ProgressSampleSchema>;
export type NormalizedSample = z.infer<typeof NormalizedSampleSchema>;
export type SinkOptions = z.input<typeof SinkOptionsSchema>;
export type SmootherOptions = z.input<typeof SmootherOptionsSchema>;
export type ProgressSnapshot = z.infer<typeof ProgressSnapshotSchema>;
export type PushResult = z.infer<typeof PushResultSchema>;
