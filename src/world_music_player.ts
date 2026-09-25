import type {ResolvedScene, WorldMusic} from './scene_types.js';

interface PlayingMusic {
  bus: GainNode;
  retireAt: number;
  gainFrom: number;
  gainTo: number;
  gainStartTime: number;
  gainEndTime: number;
}
interface PlayingScore extends PlayingMusic {
  kind: 'score';
  filter: BiquadFilterNode;
  effects: AudioNode[];
  score: WorldMusic;
  step: number;
  nextStepTime: number;
}
interface PlayingRecording extends PlayingMusic {
  kind: 'recording';
  source: AudioBufferSourceNode;
  worldID: string;
  startedAt: number;
  startOffset: number;
  duration: number;
}

const FADE_SECONDS = 1.4;
const LOOKAHEAD_SECONDS = 0.22;
const midiFrequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Owns one AudioContext and schedules short notes ahead of the audio clock. */
export class WorldMusicPlayer {
  private readonly context: AudioContext;
  private readonly output: GainNode;
  private readonly scores: readonly ResolvedScene[];
  private playing: (PlayingScore | PlayingRecording)[] = [];
  private readonly audioBuffers = new Map<string, Promise<AudioBuffer>>();
  private readonly downloads = new Map<string, AbortController>();
  private readonly recordingOffsets = new Map<string, number>();
  private scheduler: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  private started = false;
  private desiredWorldID = '';
  private worldRevision = 0;

  constructor(scores: readonly ResolvedScene[]) {
    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio is unavailable in this browser');
    }
    this.scores = scores;
    this.context = new AudioContext();
    this.output = this.context.createGain();
    this.output.gain.value = 0.65;
    this.output.connect(this.context.destination);
  }

  async start(worldID: string): Promise<void> {
    if (this.desiredWorldID === '') {
      this.desiredWorldID = worldID;
    }
    await this.context.resume();
    if (this.disposed) {
      return;
    }
    this.started = true;
    this.playWorld(this.desiredWorldID);
    this.scheduler = setInterval(() => this.schedule(), 60);
    this.schedule();
  }

  setWorld(worldID: string): void {
    if (this.disposed) {
      return;
    }
    if (this.desiredWorldID === worldID) {
      return;
    }
    this.desiredWorldID = worldID;
    this.worldRevision++;
    if (!this.started) {
      return;
    }
    this.playWorld(worldID);
  }

  private playWorld(worldID: string): void {
    const score = this.scores.find((world) => world.id === worldID)?.music;
    const now = this.context.currentTime;
    for (const playing of this.playing) {
      if (playing.kind === 'recording' && playing.retireAt === Infinity) {
        this.recordingOffsets.set(
          playing.worldID,
          (playing.startOffset + now - playing.startedAt) % playing.duration,
        );
      }
      this.fadeOut(playing, now);
    }
    if (score == null) {
      return;
    }
    const bus = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value =
      score.wave === 'square' || score.wave === 'sawtooth' ? 1300 : 3200;
    bus.gain.value = 0;
    bus.connect(filter);
    filter.connect(this.output);
    const effects: AudioNode[] = [];
    if (score.echo === true) {
      const delay = this.context.createDelay();
      const wet = this.context.createGain();
      const feedback = this.context.createGain();
      delay.delayTime.value = 45 / score.tempo;
      wet.gain.value = 0.18;
      feedback.gain.value = 0.22;
      filter.connect(delay);
      delay.connect(wet);
      wet.connect(this.output);
      wet.connect(feedback);
      feedback.connect(delay);
      effects.push(delay, wet, feedback);
    }
    const targetGain = score.volume ?? 0.7;
    bus.gain.linearRampToValueAtTime(targetGain, now + FADE_SECONDS);
    this.playing.push({
      kind: 'score',
      bus,
      filter,
      effects,
      score,
      step: 0,
      nextStepTime: now + 0.04,
      retireAt: Infinity,
      gainFrom: 0,
      gainTo: targetGain,
      gainStartTime: now,
      gainEndTime: now + FADE_SECONDS,
    });
    if (score.src != null) {
      void this.playRecording(
        worldID,
        this.worldRevision,
        score.src,
        targetGain,
      );
    }
  }

  private fadeOut(playing: PlayingScore | PlayingRecording, now: number): void {
    const progress = Math.min(
      1,
      Math.max(
        0,
        (now - playing.gainStartTime) /
          (playing.gainEndTime - playing.gainStartTime),
      ),
    );
    const currentGain =
      playing.gainFrom + (playing.gainTo - playing.gainFrom) * progress;
    playing.bus.gain.cancelScheduledValues(now);
    playing.bus.gain.setValueAtTime(currentGain, now);
    playing.bus.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    playing.retireAt = now + FADE_SECONDS;
    playing.gainFrom = currentGain;
    playing.gainTo = 0;
    playing.gainStartTime = now;
    playing.gainEndTime = now + FADE_SECONDS;
  }

  private loadRecording(src: string): Promise<AudioBuffer> {
    let pending = this.audioBuffers.get(src);
    if (pending != null) {
      this.audioBuffers.delete(src);
      this.audioBuffers.set(src, pending);
      return pending;
    }
    const download = new AbortController();
    this.downloads.set(src, download);
    pending = fetch(src, {signal: download.signal})
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Music download failed: ${response.status}`);
        }
        return this.context.decodeAudioData(await response.arrayBuffer());
      })
      .finally(() => this.downloads.delete(src));
    this.audioBuffers.set(src, pending);
    // Keep the active and previous loop cached, without retaining every decoded world.
    if (this.audioBuffers.size > 2) {
      this.audioBuffers.delete(this.audioBuffers.keys().next().value!);
    }
    return pending;
  }

  private async playRecording(
    worldID: string,
    revision: number,
    src: string,
    targetGain: number,
  ): Promise<void> {
    let buffer: AudioBuffer;
    try {
      buffer = await this.loadRecording(src);
    } catch {
      this.audioBuffers.delete(src);
      return;
    }
    if (
      this.disposed ||
      this.desiredWorldID !== worldID ||
      this.worldRevision !== revision
    ) {
      return;
    }
    const now = this.context.currentTime;
    for (const playing of this.playing) {
      if (playing.kind === 'score' && playing.retireAt === Infinity) {
        this.fadeOut(playing, now);
      }
    }
    const bus = this.context.createGain();
    const source = this.context.createBufferSource();
    bus.gain.value = 0;
    source.buffer = buffer;
    source.loop = true;
    source.connect(bus);
    bus.connect(this.output);
    bus.gain.linearRampToValueAtTime(targetGain, now + FADE_SECONDS);
    const startOffset = this.recordingOffsets.get(worldID) ?? 0;
    source.start(now, startOffset);
    this.playing.push({
      kind: 'recording',
      bus,
      source,
      worldID,
      startedAt: now,
      startOffset,
      duration: buffer.duration,
      retireAt: Infinity,
      gainFrom: 0,
      gainTo: targetGain,
      gainStartTime: now,
      gainEndTime: now + FADE_SECONDS,
    });
  }

  private release(playing: PlayingScore | PlayingRecording): void {
    playing.bus.disconnect();
    if (playing.kind === 'recording') {
      playing.source.stop();
      playing.source.disconnect();
      return;
    }
    playing.filter.disconnect();
    for (const effect of playing.effects) {
      effect.disconnect();
    }
  }

  private note(
    bus: AudioNode,
    pitch: number,
    start: number,
    duration: number,
    volume: number,
    wave: OscillatorType,
    envelopeStyle: 'pluck' | 'organ' = 'pluck',
  ): void {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = midiFrequency(pitch);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(
      volume,
      start + (envelopeStyle === 'organ' ? 0.14 : 0.025),
    );
    envelope.gain.setTargetAtTime(
      0,
      start + duration * (envelopeStyle === 'organ' ? 0.82 : 0.55),
      duration * (envelopeStyle === 'organ' ? 0.1 : 0.17),
    );
    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.2);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }

  private organNote(
    bus: AudioNode,
    pitch: number,
    start: number,
    duration: number,
    volume: number,
  ): void {
    // A small additive pipe-organ voice: fundamental, octave, and upper fifth.
    this.note(bus, pitch, start, duration, volume, 'sine', 'organ');
    this.note(bus, pitch + 12, start, duration, volume * 0.34, 'sine', 'organ');
    this.note(bus, pitch + 19, start, duration, volume * 0.12, 'sine', 'organ');
  }

  private schedule(): void {
    const now = this.context.currentTime;
    this.playing = this.playing.filter((playing) => {
      if (playing.retireAt > now) {
        return true;
      }
      this.release(playing);
      return false;
    });
    for (const playing of this.playing) {
      if (playing.kind === 'recording') {
        continue;
      }
      const stepDuration = 30 / playing.score.tempo;
      // Skip elapsed steps after a suspended or throttled tab; never queue a burst.
      if (playing.nextStepTime < now - stepDuration) {
        const skipped = Math.floor((now - playing.nextStepTime) / stepDuration);
        playing.step = (playing.step + skipped) % 32;
        playing.nextStepTime += skipped * stepDuration;
      }
      while (playing.nextStepTime < now + LOOKAHEAD_SECONDS) {
        const start = Math.max(now, playing.nextStepTime);
        if (start >= playing.retireAt) {
          break;
        }
        const {score, step, bus} = playing;
        const melodyNote = score.melody[step];
        if (melodyNote != null) {
          if (score.instrument === 'organ') {
            this.organNote(bus, melodyNote, start, stepDuration * 1.25, 0.045);
          } else {
            this.note(
              bus,
              melodyNote,
              start,
              stepDuration * 0.85,
              0.07,
              score.wave ?? 'sine',
            );
          }
        }
        if (step % 4 === 0) {
          this.note(
            bus,
            score.bass[Math.floor(step / 8)],
            start,
            stepDuration * 3.2,
            0.09,
            'sine',
          );
        }
        if (step % 8 === 0) {
          for (const chordNote of score.chords[step / 8]) {
            if (score.instrument === 'organ') {
              this.organNote(bus, chordNote, start, stepDuration * 8.5, 0.014);
            } else {
              this.note(
                bus,
                chordNote,
                start,
                stepDuration * 7.5,
                0.018,
                'triangle',
              );
            }
          }
        }
        playing.step = (step + 1) % 32;
        playing.nextStepTime += stepDuration;
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    if (this.scheduler != null) {
      clearInterval(this.scheduler);
    }
    for (const download of this.downloads.values()) {
      download.abort();
    }
    this.downloads.clear();
    this.audioBuffers.clear();
    this.recordingOffsets.clear();
    for (const playing of this.playing) {
      this.release(playing);
    }
    this.playing = [];
    this.output.disconnect();
    void this.context.close().catch(() => undefined);
  }
}
