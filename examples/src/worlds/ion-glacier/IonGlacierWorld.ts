import { defineWorld } from '../shared/WorldDefinition.js';
import { drawTerrain } from '../shared/TerrainGeometry.js';

export default defineWorld({
  id: 'glacier',
  name: 'Ion Glacier',
  description:
    'Icy foothills, distant snow-tipped mountain ranges, and turquoise crystals beneath an aurora.',
  caption: 'A clear path forward.',
  palette: {
    sky: [0.015, 0.04, 0.1],
    horizon: [0.12, 0.32, 0.36],
    road: [0.07, 0.15, 0.2],
    accent: [0.36, 1, 0.92],
    ground: [0.1, 0.23, 0.28],
  },
  sky: 4,
  ground: true,
  draw(geometryBuilder, sceneFrame) {
    drawTerrain(
      geometryBuilder,
      sceneFrame.distance,
      sceneFrame.centerX,
      sceneFrame.palette,
      true,
      sceneFrame.far,
      sceneFrame.near,
    );
  },
});
