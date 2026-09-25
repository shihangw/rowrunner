import { defineWorld } from '../shared/WorldDefinition.js';
import { drawNeon } from './NeonMeridianGeometry.js';

export default defineWorld({
  id: 'midnight',
  name: 'Neon Meridian',
  description:
    'Neon storefronts, layered city districts, rooftop antennas, and a towering off-world skyline.',
  caption: 'The city never stops.',
  palette: {
    sky: [0.012, 0.022, 0.058],
    horizon: [0.1, 0.18, 0.23],
    road: [0.055, 0.085, 0.12],
    accent: [0.24, 0.96, 0.86],
    ground: [0.035, 0.065, 0.082],
  },
  sky: 0,
  ground: true,
  draw(geometryBuilder, sceneFrame) {
    drawNeon(
      geometryBuilder,
      sceneFrame.distance,
      sceneFrame.centerX,
      sceneFrame.palette,
      sceneFrame.far,
      sceneFrame.near,
      sceneFrame.view,
    );
  },
});
