import * as THREE from 'three';
import {defineRunner, disposeObject3D} from 'rowrunner/plugins';

export const surveyDrone = defineRunner({
  id: 'survey-drone',
  name: 'Survey Drone',
  description:
    'A native Three.js scout with metallic wings and a luminous cyan eye.',
  forwardAxis: '-z',
  scale: 0.9,
  offset: [0, 3, -1],
  bob: 0.16,
  roll: 0.025,
  create() {
    const object = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({
      color: 0x9bbacc,
      metalness: 0.55,
      roughness: 0.32,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x263d50,
      metalness: 0.6,
      roughness: 0.4,
    });
    const glow = new THREE.MeshStandardMaterial({
      color: 0x61ffe6,
      emissive: 0x36e8df,
      emissiveIntensity: 1.5,
    });
    const sphere = new THREE.SphereGeometry(1, 32, 24);
    const body = new THREE.Mesh(sphere, metal);
    body.position.y = 1;
    body.scale.set(1.1, 0.6, 0.85);
    object.add(body);
    const eye = new THREE.Mesh(sphere, glow);
    eye.position.set(0, 1, -0.76);
    eye.scale.set(0.35, 0.25, 0.12);
    object.add(eye);
    const thrusters: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 1.3), dark);
      wing.position.set(side * 1.25, 0.89, 0.15);
      object.add(wing);
      const thruster = new THREE.Mesh(sphere, glow);
      thruster.position.set(side * 1.25, 0.7, 0.15);
      thruster.scale.set(0.22, 0.2, 0.35);
      object.add(thruster);
      thrusters.push(thruster);
    }
    return {
      object,
      update({time, reduced}) {
        for (const thruster of thrusters) {
          thruster.scale.y = reduced ? 0.2 : 0.2 + 0.08 * Math.sin(time * 5);
        }
      },
      dispose() {
        disposeObject3D(object);
      },
    };
  },
});
