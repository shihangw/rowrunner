import {defineWorld} from '../shared/world_definition.js';
import {createBinaryOrbit, orbitCamera} from './binary_eclipse_orbit.js';
import {createBinaryBlackHoles} from './binary_eclipse_objects.js';

export const binaryEclipse = defineWorld({
  id: 'black-holes',
  name: 'Binary Eclipse',
  description:
    'A distant orbital road around two enormous black holes slowly orbiting each other, with amber and icy-blue halos and curved arcs of light.',
  caption: 'Between two infinities.',
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
    farClipDistance: 12000,
  }),
  create: createBinaryBlackHoles,
  draw() {},
});
