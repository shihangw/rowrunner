import { defineRunner } from 'rowrunner/plugins';
import { drawPaperPlane } from './PaperPlaneGeometry.js';

export default defineRunner({
  kind: 'runner',
  apiVersion: 1,
  id: 'paper-plane',
  name: 'Paper Plane',
  description: 'A folded ivory glider with a coral underside.',
  forwardAxis: '+z',
  draw(geometryBuilder, sceneFrame) {
    drawPaperPlane(geometryBuilder);
  },
});
