import { defineWorld } from '../shared/WorldDefinition.js';
import { drawStorm } from './SeaStormGeometry.js';

export default defineWorld({
  id: 'sea-storm',
  name: 'Sea Storm',
  description:
    'Crossing ocean swells, broken whitecaps, wind-driven rain, and distant lightning around a luminous causeway.',
  caption: 'Through the squall.',
  palette: {
    sky: [0.018, 0.03, 0.047],
    horizon: [0.16, 0.22, 0.26],
    road: [0.055, 0.1, 0.13],
    accent: [0.42, 0.84, 0.95],
    ground: [0.035, 0.095, 0.14],
  },
  sky: 6,
  ground: false,
  draw(geometryBuilder, sceneFrame) {
    drawStorm(
      geometryBuilder,
      sceneFrame.distance,
      sceneFrame.centerX,
      sceneFrame.palette,
      sceneFrame.time,
      sceneFrame.reduced,
      sceneFrame.far,
      sceneFrame.near,
    );
  },
});
