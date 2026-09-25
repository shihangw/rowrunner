import { defineRunner } from 'rowrunner/plugins';
import { drawBookie } from './BookieGeometry.js';

export default defineRunner({
  kind: 'runner',
  apiVersion: 1,
  id: 'bookie',
  name: 'Bookie',
  description: 'A curious bookworm with round glasses and a flying book.',
  forwardAxis: '-z',
  draw(geometryBuilder, sceneFrame) {
    drawBookie(geometryBuilder, sceneFrame.time, sceneFrame.rate, sceneFrame.reduced);
  },
});
