import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdditiveBlending,
  NormalBlending,
  PerspectiveCamera,
  Vector3,
} from 'three';
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
      assert.ok(
        Math.abs(minHeight + disk.material.uniforms.diskHalfThickness.value) <
          1e-6,
      );
      assert.ok(
        Math.abs(maxHeight - disk.material.uniforms.diskHalfThickness.value) <
          1e-6,
      );
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

test('plasma keeps a view from above the disk with the rises on its sides', () => {
  const instance = createBinaryBlackHoles();
  const projectWorldPoint = createBinaryOrbit(0).localWorldPoint;
  const camera = new PerspectiveCamera();
  for (const time of [0, 15, 30, 60]) {
    instance.update({time, projectWorldPoint});
    instance.object.updateMatrixWorld(true);
    for (const offset of [
      [300, 200, 1200],
      [-800, 400, -200],
      [10, 1200, 20],
    ]) {
      for (const [index, body] of instance.object.children.entries()) {
        const center = body.getWorldPosition(new Vector3());
        camera.position.copy(center).add(new Vector3(...offset));
        camera.lookAt(center);
        camera.updateMatrixWorld(true);
        const disk = body.getObjectByName('accretion-disk');
        disk.onBeforeRender(null, null, camera);
        const uniforms = disk.material.uniforms;
        const toward = camera.position.clone().sub(center).normalize();
        const diskNormal = new Vector3(0, 0, 1).applyQuaternion(
          disk.quaternion,
        );
        const side = uniforms.bulgeDirection.value
          .clone()
          .applyQuaternion(disk.quaternion);
        const expectedSide = new Vector3()
          .crossVectors(
            new Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
            toward,
          )
          .normalize();
        assert.ok(
          Math.abs(diskNormal.dot(toward) - Math.sin((12 * Math.PI) / 180)) <
            1e-10,
        );
        assert.ok(side.dot(expectedSide) > 0.99999);
        assert.deepEqual(
          body.getObjectByName('disk-attenuation').quaternion.toArray(),
          disk.quaternion.toArray(),
        );
        const occluder = uniforms.occluderCenter.value
          .clone()
          .applyQuaternion(disk.quaternion);
        body.localToWorld(occluder);
        assert.ok(
          occluder.distanceTo(
            instance.object.children[1 - index].getWorldPosition(new Vector3()),
          ) < 1e-7,
        );
        assert.ok(
          uniforms.diskHalfThickness.value >=
            uniforms.diskBaseHalfThickness.value +
              uniforms.diskBulgeHeight.value,
        );
      }
    }
  }
  instance.dispose();
});

test('plasma animation follows scene time and respects reduced motion', () => {
  const instance = createBinaryBlackHoles();
  const projectWorldPoint = createBinaryOrbit(0).localWorldPoint;
  for (const time of [0, 4, 15]) {
    instance.update({time, reduced: false, projectWorldPoint});
    for (const body of instance.object.children) {
      const disk = body.getObjectByName('accretion-disk');
      const halo = body.getObjectByName('photon-halo').children[0];
      assert.equal(disk.material.uniforms.plasmaTime.value, time * 3);
      assert.equal(halo.material.uniforms.plasmaTime.value, time * 3);
    }
  }
  instance.update({time: 20, reduced: true, projectWorldPoint});
  for (const body of instance.object.children) {
    assert.equal(
      body.getObjectByName('accretion-disk').material.uniforms.plasmaTime.value,
      0,
    );
  }
  instance.dispose();
});

test('all plasma attenuation precedes emission and shares animated uniforms', () => {
  const instance = createBinaryBlackHoles();
  const attenuationPasses = [];
  const emissionPasses = [];
  for (const body of instance.object.children) {
    const disk = body.getObjectByName('accretion-disk');
    const halo = body.getObjectByName('photon-halo').children[0];
    for (const [name, emitter] of [
      ['disk-attenuation', disk],
      ['halo-attenuation', halo],
    ]) {
      const attenuation = body.getObjectByName(name);
      assert.equal(attenuation.geometry, emitter.geometry);
      assert.deepEqual(
        attenuation.quaternion.toArray(),
        emitter.quaternion.toArray(),
      );
      assert.equal(attenuation.material.uniforms, emitter.material.uniforms);
      assert.equal(attenuation.material.blending, NormalBlending);
      assert.equal(emitter.material.blending, AdditiveBlending);
      assert.equal(attenuation.material.depthWrite, false);
      assert.equal(emitter.material.depthTest, true);
      attenuationPasses.push(attenuation.renderOrder);
      emissionPasses.push(emitter.renderOrder);
    }
  }
  assert.ok(Math.max(...attenuationPasses) < Math.min(...emissionPasses));
  instance.dispose();
});
