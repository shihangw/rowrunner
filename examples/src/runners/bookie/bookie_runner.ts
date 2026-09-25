import {defineRunner} from 'rowrunner/plugins';
import {drawBookie} from './bookie_geometry.js';

export const bookie = defineRunner({
  kind: 'runner',
  apiVersion: 1,
  id: 'bookie',
  name: 'Bookie',
  description: 'A curious bookworm with round glasses and a flying book.',
  forwardAxis: '-z',
  draw(geometryBuilder, sceneFrame) {
    drawBookie(
      geometryBuilder,
      sceneFrame.time,
      sceneFrame.rate,
      sceneFrame.reduced,
    );
  },
});
