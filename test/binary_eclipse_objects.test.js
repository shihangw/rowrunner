import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createBinaryBlackHoles} from '../examples/src/worlds/binary-eclipse/binary_eclipse_objects.ts';
import {
  binaryCenters,
  createBinaryOrbit,
  BLACK_HOLE_RADII,
  ORBIT_TRAVEL_SCALE,
} from '../examples/src/worlds/binary-eclipse/binary_eclipse_orbit.js';

test('binary meshes share the floating origin and preserve astronomical scale', () => {
  const instance = createBinaryBlackHoles();
  const disks = instance.object.children.map((body) =>
    body.getObjectByName('accretion-disk'),
  );
  assert.deepEqual(
    disks[0].quaternion.toArray(),
    disks[1].quaternion.toArray(),
  );
  for (const distance of [0, 1200, 7500]) {
    const orbit = createBinaryOrbit(distance, 800);
    instance.update({time: 15, projectWorldPoint: orbit.localWorldPoint});
    const centers = binaryCenters(15);
    instance.object.children.forEach((body, index) => {
      assert.deepEqual(
        body.position.toArray(),
        orbit.localWorldPoint(centers[index]),
      );
      assert.equal(body.scale.x, BLACK_HOLE_RADII[index] / ORBIT_TRAVEL_SCALE);
      const sphere = body.getObjectByName('opaque-event-horizon');
      assert.equal(sphere.geometry.type, 'SphereGeometry');
      assert.equal(sphere.material.color.getHex(), 0);
      assert.equal(sphere.material.transparent, false);
      assert.equal(sphere.material.depthWrite, true);
      const disk = body.getObjectByName('accretion-disk');
      assert.equal(disk.geometry.type, 'CylinderGeometry');
      assert.equal(disk.children.length, 0);
      assert.equal(disk.material.depthTest, true);
      const positions = disk.geometry.getAttribute('position');
      let outerRadius = 0;
      let minHeight = Infinity;
      let maxHeight = -Infinity;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        outerRadius = Math.max(
          outerRadius,
          Math.hypot(positions.getX(vertex), positions.getY(vertex)),
        );
        minHeight = Math.min(minHeight, positions.getZ(vertex));
        maxHeight = Math.max(maxHeight, positions.getZ(vertex));
      }
      assert.ok(
        Math.abs(outerRadius - disk.material.uniforms.diskOuterRadius.value) <
          1e-6,
      );
      assert.equal(minHeight, -disk.material.uniforms.diskHalfThickness.value);
      assert.equal(maxHeight, disk.material.uniforms.diskHalfThickness.value);
      assert.equal(
        disk.material.uniforms.innerRadius.value,
        sphere.geometry.parameters.radius,
      );
      const other = instance.object.children[1 - index];
      const occluderPosition = disk.material.uniforms.occluderCenter.value
        .clone()
        .applyQuaternion(disk.quaternion)
        .multiplyScalar(body.scale.x)
        .add(body.position);
      assert.ok(occluderPosition.distanceTo(other.position) < 1e-7);
      assert.equal(
        disk.material.uniforms.occluderRadius.value * body.scale.x,
        other.scale.x,
      );
      const halo = body.getObjectByName('photon-halo');
      assert.equal(halo.children.length, 1);
      const shell = halo.children[0];
      assert.equal(shell.material, disk.material);
      assert.equal(shell.geometry.type, 'SphereGeometry');
      assert.equal(shell.material.depthTest, true);
      assert.equal(
        shell.material.uniforms.innerRadius.value,
        sphere.geometry.parameters.radius,
      );
      assert.ok(
        shell.geometry.parameters.radius > sphere.geometry.parameters.radius,
      );
      assert.deepEqual(
        shell.getWorldPosition(new Vector3()).toArray(),
        sphere.getWorldPosition(new Vector3()).toArray(),
      );
    });
  }
  instance.dispose();
});

test('each instance owns and releases all black-hole geometry and materials', () => {
  const first = createBinaryBlackHoles();
  const second = createBinaryBlackHoles();
  assert.notEqual(first.object, second.object);
  const resources = new Set();
  first.object.traverse((child) => {
    if (child.geometry != null) {
      resources.add(child.geometry);
    }
    if (child.material != null) {
      resources.add(child.material);
    }
  });
  let released = 0;
  for (const resource of resources) {
    resource.addEventListener('dispose', () => released++);
  }
  first.dispose();
  assert.equal(released, resources.size);
  second.update({
    time: 0,
    projectWorldPoint: createBinaryOrbit(0).localWorldPoint,
  });
  assert.equal(second.object.visible, true);
  second.dispose();
});
