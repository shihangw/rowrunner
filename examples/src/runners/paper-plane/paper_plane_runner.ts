import {defineRunner} from '@shihangw/rowrunner/plugins';
import {drawPaperPlane} from './paper_plane_geometry.js';

export const paperPlane = defineRunner({
  kind: 'runner',
  apiVersion: 1,
  id: 'paper-plane',
  name: 'Paper Plane',
  description: 'A folded ivory glider with a coral underside.',
  forwardAxis: '+z',
  draw(geometryBuilder) {
    drawPaperPlane(geometryBuilder);
  },
});
