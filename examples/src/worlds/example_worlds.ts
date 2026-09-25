import {neonMeridian} from './neon-meridian/neon_meridian_world.ts';
import {cloudHarbor} from './cloud-harbor/cloud_harbor_world.ts';
import {emberReach} from './ember-reach/ember_reach_world.ts';
import {binaryEclipse} from './binary-eclipse/binary_eclipse_world.ts';
import {ionGlacier} from './ion-glacier/ion_glacier_world.ts';
import {matrix} from './matrix/matrix_world.ts';
import {seaStorm} from './sea-storm/sea_storm_world.ts';

export const worlds = [
  neonMeridian,
  cloudHarbor,
  emberReach,
  binaryEclipse,
  ionGlacier,
  matrix,
  seaStorm,
] as const;
