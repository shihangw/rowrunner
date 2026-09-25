import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldMusicPlayer} from '../src/world_music_player.js';
import {sceneCatalog} from '../src/scene_configuration_catalog.js';
import {worlds} from '../examples/src/worlds/example_worlds.ts';

class FakeAudioParameter {
  value = 0;
  ramps = [];
  cancelScheduledValues() {}
  setValueAtTime(value) {
    this.value = value;
  }
  linearRampToValueAtTime(value, time) {
    this.ramps.push({value, time});
  }
  setTargetAtTime() {}
}

class FakeAudioNode {
  gain = new FakeAudioParameter();
  frequency = new FakeAudioParameter();
  disconnected = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
  start(...argumentsList) {
    this.startArguments = argumentsList;
  }
  stop() {
    this.stopped = true;
  }
}

class FakeAudioContext {
  static latest;
  currentTime = 10;
  destination = new FakeAudioNode();
  closed = false;
  oscillators = [];
  constructor() {
    FakeAudioContext.latest = this;
  }
  createGain() {
    return new FakeAudioNode();
  }
  createBiquadFilter() {
    return new FakeAudioNode();
  }
  createDelay() {
    const delay = new FakeAudioNode();
    delay.delayTime = new FakeAudioParameter();
    return delay;
  }
  createOscillator() {
    const oscillator = new FakeAudioNode();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  createBufferSource() {
    return new FakeAudioNode();
  }
  async decodeAudioData() {
    return {duration: 24};
  }
  async resume() {}
  async close() {
    this.closed = true;
  }
}

test('each example world owns a distinct, valid music score', () => {
  const scores = sceneCatalog(worlds).map((world) => world.music);
  assert.equal(scores.length, 7);
  assert.ok(scores.every((score) => score != null));
  assert.equal(new Set(scores.map((score) => score.tempo)).size, 7);
});

test('recorded loops replace the score after loading and stop on world exit', async () => {
  const previousAudioContext = globalThis.AudioContext;
  const previousFetch = globalThis.fetch;
  globalThis.AudioContext = FakeAudioContext;
  globalThis.fetch = async () => ({
    ok: true,
    async arrayBuffer() {
      return new ArrayBuffer(8);
    },
  });
  try {
    const score = {...worlds[0].music, src: '/music/neon.mp3'};
    const scenes = sceneCatalog([
      {...worlds[0], music: score},
      {id: 'silent', draw() {}, music: null},
    ]);
    const player = new WorldMusicPlayer(scenes);
    await player.start(worlds[0].id);
    await new Promise((resolve) => setImmediate(resolve));
    const recording = player.playing.find(
      (playing) => playing.kind === 'recording',
    );
    assert.ok(recording);
    assert.equal(recording.source.loop, true);
    assert.equal(recording.source.buffer.duration, 24);
    assert.deepEqual(recording.source.startArguments, [10, 0]);
    FakeAudioContext.latest.currentTime += 5;
    player.setWorld('silent');
    FakeAudioContext.latest.currentTime += 1.5;
    player.schedule();
    assert.equal(recording.source.stopped, true);
    player.setWorld(worlds[0].id);
    await new Promise((resolve) => setImmediate(resolve));
    const resumedRecording = player.playing.find(
      (playing) => playing.kind === 'recording',
    );
    assert.deepEqual(resumedRecording.source.startArguments, [16.5, 5]);
    player.dispose();
  } finally {
    globalThis.AudioContext = previousAudioContext;
    globalThis.fetch = previousFetch;
  }
});

test('music schedules notes, crossfades worlds, and releases audio resources', async () => {
  const previousAudioContext = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const scores = sceneCatalog(worlds);
    const player = new WorldMusicPlayer(scores);
    await player.start('midnight');
    const context = FakeAudioContext.latest;
    assert.ok(context.oscillators.length > 0);
    const firstTrack = player.playing[0];
    const previousVoiceCount = context.oscillators.length;
    player.setWorld('black-holes');
    player.schedule();
    assert.equal(player.playing.length, 2);
    assert.equal(firstTrack.bus.gain.ramps.at(-1).value, 0);
    assert.equal(player.playing[1].effects.length, 3);
    assert.ok(context.oscillators.length > previousVoiceCount + 9);
    context.currentTime += 1.5;
    player.schedule();
    assert.equal(firstTrack.bus.disconnected, true);
    assert.equal(player.playing.length, 1);
    player.dispose();
    assert.equal(context.closed, true);
    assert.equal(player.playing.length, 0);
  } finally {
    globalThis.AudioContext = previousAudioContext;
  }
});
