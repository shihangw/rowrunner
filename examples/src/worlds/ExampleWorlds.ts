import neonMeridian from './neon-meridian/NeonMeridianWorld.ts';
import cloudHarbor from './cloud-harbor/CloudHarborWorld.ts';
import emberReach from './ember-reach/EmberReachWorld.ts';
import ionGlacier from './ion-glacier/IonGlacierWorld.ts';
import matrix from './matrix/MatrixWorld.ts';
import seaStorm from './sea-storm/SeaStormWorld.ts';
import binaryEclipse from './binary-eclipse/BinaryEclipseWorld.ts';

export const worlds = [
  neonMeridian,
  cloudHarbor,
  emberReach,
  ionGlacier,
  matrix,
  seaStorm,
  binaryEclipse,
] as const;
