import { defineRunner } from 'rowrunner/plugins';
import { drawPrism } from './PrismGeometry.js';

export default defineRunner({
  kind: 'runner',
  apiVersion: 1,
  id: 'courier',
  name: 'Prism',
  description:
    'A floating glass icosahedron with iridescent facets, a breathing halo, and a luminous crystal core.',
  forwardAxis: '+z',
  draw(geometryBuilder, sceneFrame) {
    drawPrism(geometryBuilder, sceneFrame.time, sceneFrame.rate, sceneFrame.reduced);
  },
});
