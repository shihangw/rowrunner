import { defineWorld } from '../shared/WorldDefinition.js';
import { drawHarbor } from './CloudHarborGeometry.js';

export default defineWorld({
  id: 'clouds',
  name: 'Cloud Harbor',
  description: 'Sky islands, cargo ships, and orbital listening stations.',
  caption: 'Above and beyond.',
  palette: {
    sky: [0.13, 0.31, 0.46],
    horizon: [0.59, 0.73, 0.77],
    road: [0.18, 0.3, 0.36],
    accent: [0.6, 0.96, 1],
    ground: [0.3, 0.48, 0.53],
  },
  sky: 2,
  ground: false,
  draw(geometryBuilder, sceneFrame) {
    drawHarbor(
      geometryBuilder,
      sceneFrame.distance,
      sceneFrame.centerX,
      sceneFrame.palette,
      sceneFrame.far,
      sceneFrame.near,
    );
  },
});
