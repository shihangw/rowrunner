import {defineWorld} from '../shared/world_definition.js';
const binaryEclipseSoundtrackURL = new URL(
  '../../assets/music/binary_eclipse.mp3',
  import.meta.url,
).href;
import {createBinaryOrbit, orbitCamera} from './binary_eclipse_orbit.js';

export const binaryEclipse = defineWorld({
  id: 'black-holes',
  name: 'Binary Eclipse',
  description:
    'A distant orbital road around two enormous stationary black holes, with amber and icy-blue halos and curved arcs of light.',
  caption: 'Between two infinities.',
  music: {
    src: binaryEclipseSoundtrackURL,
    tempo: 68,
    instrument: 'organ',
    echo: true,
    melody: [
      62, 69, 74, 77, 81, 77, 74, 69, 58, 65, 70, 74, 77, 74, 70, 65, 65, 72,
      77, 81, 84, 81, 77, 72, 60, 67, 72, 74, 79, 74, 72, 67,
    ],
    bass: [38, 34, 41, 36],
    chords: [
      [50, 53, 57],
      [46, 50, 53],
      [53, 57, 60],
      [48, 55, 62],
    ],
  },
  palette: {
    sky: [0.003, 0.004, 0.015],
    horizon: [0.008, 0.007, 0.021],
    road: [0.055, 0.055, 0.09],
    accent: [0.72, 0.65, 1],
    ground: [0.008, 0.009, 0.024],
  },
  sky: 7,
  ground: false,
  path: Object.freeze({
    createFrame: createBinaryOrbit,
    camera: orbitCamera,
    introDuration: 6,
    introHorizontalFov: 70,
    minRange: 1200,
    fogDistance: 1000,
  }),
  draw() {},
});
