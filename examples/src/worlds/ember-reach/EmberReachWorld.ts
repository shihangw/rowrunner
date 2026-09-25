import { defineWorld } from '../shared/WorldDefinition.js';
import { drawTerrain } from '../shared/TerrainGeometry.js';

export default defineWorld({
  id: 'ember',
  name: 'Ember Reach',
  description:
    'Low rust-colored foothills, layered volcanic mountains, and glowing crystal fields on a red planet.',
  caption: 'Through the heart of it.',
  palette: {
    sky: [0.1, 0.018, 0.036],
    horizon: [0.37, 0.12, 0.085],
    road: [0.095, 0.07, 0.078],
    accent: [1, 0.32, 0.12],
    ground: [0.1, 0.048, 0.045],
  },
  sky: 3,
  ground: true,
  draw(geometryBuilder, sceneFrame) {
    drawTerrain(
      geometryBuilder,
      sceneFrame.distance,
      sceneFrame.centerX,
      sceneFrame.palette,
      false,
      sceneFrame.far,
      sceneFrame.near,
    );
  },
});
