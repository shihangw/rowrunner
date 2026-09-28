import {defineWorld} from '../shared/world_definition.js';
import {drawMatrix} from './matrix_geometry.js';

export const matrix = defineWorld({
  id: 'matrix',
  name: 'Matrix',
  description:
    'Layered green code curtains, server clusters, distant data towers, and a glowing circuit grid.',
  caption: 'Follow the signal.',
  palette: {
    sky: [0.001, 0.009, 0.004],
    horizon: [0.012, 0.065, 0.026],
    road: [0.01, 0.03, 0.017],
    accent: [0.14, 1, 0.35],
    ground: [0.003, 0.014, 0.007],
  },
  sky: 5,
  ground: true,
  draw(geometryBuilder, sceneFrame) {
    drawMatrix(
      geometryBuilder,
      sceneFrame.distance,
      sceneFrame.centerX,
      sceneFrame.palette,
      sceneFrame.time,
      sceneFrame.far,
      sceneFrame.roadLight,
      sceneFrame.near,
    );
  },
});
