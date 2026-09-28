import {z} from 'zod';

/** The example's optional soundtrack format; it is not part of Rowrunner. */
export const WorldMusicSchema = z.object({
  tempo: z.number().finite().min(40).max(200),
  melody: z.array(z.number().int().min(24).max(108).nullable()).length(32),
  bass: z.array(z.number().int().min(24).max(84)).length(4),
  chords: z
    .array(z.array(z.number().int().min(36).max(96)).length(3))
    .length(4),
  wave: z.enum(['sine', 'triangle', 'sawtooth', 'square']).optional(),
  instrument: z.enum(['synth', 'organ']).optional(),
  echo: z.boolean().optional(),
  /** The procedural score plays while this recording loads or if it fails. */
  src: z.string().min(1).optional(),
  volume: z.number().finite().min(0).max(1).optional(),
});

export type WorldMusic = z.infer<typeof WorldMusicSchema>;
