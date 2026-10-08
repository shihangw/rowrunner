import {
  NormalBlending,
  AdditiveBlending,
  Color,
  Float32BufferAttribute,
  Group,
  CylinderGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import {disposeObject3D} from '@shihangw/rowrunner/plugins';
import type {PluginInstance} from '@shihangw/rowrunner/plugins';
import {
  binaryCenters,
  BLACK_HOLE_RADII,
  ORBIT_TRAVEL_SCALE,
} from './binary_eclipse_orbit.js';

// Accelerate material flow independently of the binary orbit and camera.
const PLASMA_FLOW_SPEED = 3;

const plasmaVertex = `
  attribute float haloSurface;
  uniform float spinDirection;
  uniform vec3 diskNormal,diskAxisX,diskAxisY;
  varying vec3 localPosition,viewPosition,viewCenter,localCamera;
  varying float bodyScale,surfaceKind;
  varying vec3 plasmaPosition;
  void main(){
    localPosition=position;
    plasmaPosition=haloSurface>.5
      ?vec3(dot(position,diskAxisX),dot(position,diskAxisY),dot(position,diskNormal))
      :position;
    surfaceKind=haloSurface;
    viewPosition=(modelViewMatrix*vec4(position,1.)).xyz;
    // Model transforms have uniform scale, so transpose(rotation) / scale
    // maps the camera into this object's coordinates without a per-frame inverse.
    vec3 offset=-modelViewMatrix[3].xyz;
    float scaleSquared=dot(modelViewMatrix[0].xyz,modelViewMatrix[0].xyz);
    localCamera=vec3(dot(modelViewMatrix[0].xyz,offset),
      dot(modelViewMatrix[1].xyz,offset),dot(modelViewMatrix[2].xyz,offset))/scaleSquared;
    viewCenter=(modelViewMatrix*vec4(0.,0.,0.,1.)).xyz;
    bodyScale=length((modelViewMatrix*vec4(0.,0.,1.,0.)).xyz);
    gl_Position=projectionMatrix*vec4(viewPosition,1.);
  }
`;
const plasmaFragment = `
  uniform vec3 haloColor;
  uniform vec3 occluderCenter,bulgeDirection;
  uniform float occluderRadius,diskBaseHalfThickness,diskBulgeHeight,plasmaTime;
  uniform float innerRadius,outerRadius,diskOuterRadius,diskHalfThickness,spinDirection;
  varying vec3 localPosition,viewPosition,viewCenter,localCamera;
  varying float bodyScale,surfaceKind;
  varying vec3 plasmaPosition;
  float plasmaHash(vec3 point){
    point=fract(point*.1031);
    point+=dot(point,point.yzx+33.33);
    return fract((point.x+point.y)*point.z);
  }
  float plasmaNoise(vec3 point){
    vec3 cell=floor(point),fraction=fract(point);
    fraction=fraction*fraction*(3.-2.*fraction);
    return mix(
      mix(mix(plasmaHash(cell),plasmaHash(cell+vec3(1,0,0)),fraction.x),
          mix(plasmaHash(cell+vec3(0,1,0)),plasmaHash(cell+vec3(1,1,0)),fraction.x),fraction.y),
      mix(mix(plasmaHash(cell+vec3(0,0,1)),plasmaHash(cell+vec3(1,0,1)),fraction.x),
          mix(plasmaHash(cell+vec3(0,1,1)),plasmaHash(cell+vec3(1,1,1)),fraction.x),fraction.y),fraction.z);
  }
  // Height, slope, and approximate distance along the raised plasma sheet.
  vec3 plasmaSheet(float radius,float alignment){
    float crownRadius=innerRadius+.12;
    float joinRadius=innerRadius*.90;
    float joinHeight=sqrt(crownRadius*crownRadius-joinRadius*joinRadius);
    float joinSlope=-joinRadius/joinHeight;
    float taperWidth=.75;
    float taper=clamp((radius-joinRadius)/taperWidth,0.,1.);
    float squared=taper*taper,cubed=squared*taper;
    float shoulder=(2.*cubed-3.*squared+1.)*joinHeight
      +(cubed-2.*squared+taper)*taperWidth*joinSlope;
    float shoulderSlope=(6.*squared-6.*taper)*joinHeight/taperWidth
      +(3.*squared-4.*taper+1.)*joinSlope;
    float crown=sqrt(max(.0001,crownRadius*crownRadius-radius*radius));
    float rise=radius<joinRadius?crown:shoulder;
    float slope=radius<joinRadius?-radius/crown:shoulderSlope;
    float blend=clamp((radius-.05)/.80,0.,1.);
    float angularWeight=mix(1.,alignment*alignment,blend*blend*(3.-2.*blend));
    float angularSlope=(alignment*alignment-1.)*6.*blend*(1.-blend)/.80;
    float crownDistance=crownRadius*asin(min(radius,joinRadius)/crownRadius);
    float distance=crownDistance+length(vec2(max(radius-joinRadius,0.),
      radius<joinRadius?0.:shoulder-joinHeight));
    return vec3(rise*angularWeight,slope*angularWeight+rise*angularSlope,
      mix(radius,distance,angularWeight));
  }
  float plasmaFlow(vec3 point,vec3 sheet){
    float radius=length(point.xy);
    vec2 radial=point.xy/max(radius,.0001);
    float along=sheet.z;
    float depth=(abs(point.z)-sheet.x)/sqrt(1.+sheet.y*sheet.y);
    float phase=spinDirection*plasmaTime*.35;
    vec2 around=mat2(cos(phase),-sin(phase),sin(phase),cos(phase))*radial;
    // Periodic bends keep each loop closed, with no angular seam.
    float secondHarmonic=2.*around.x*around.y;
    float thirdHarmonic=around.y*(3.-4.*around.y*around.y);
    float poleFade=smoothstep(0.,.30,radius);
    float wandering=(.10*secondHarmonic+.045*thirdHarmonic)*poleFade;
    float loopCoordinate=along+wandering+clamp(depth,-.4,.4)*.18;
    float flux=plasmaNoise(vec3(loopCoordinate*5.,2.7,4.1));
    float filament=pow(1.-abs(flux*2.-1.),4.);
    // Bright knots travel around the loops without breaking their continuity.
    float knots=plasmaNoise(vec3(around*2.*poleFade,along*1.8+plasmaTime*.10));
    return .55+1.25*filament*(.75+.50*knots);
  }
  // Both radial sides share the same emission and density rules. Flow may
  // vary locally, but viewing direction never darkens an entire side.
  vec3 plasmaEmission(float heat){
    return mix(haloColor,vec3(1.),.35)*3.*(.7+.3*heat);
  }
  vec3 compressEmission(vec3 emission){
    float peak=max(emission.r,max(emission.g,emission.b));
    return emission*(1.-exp(-peak))/max(peak,.0001);
  }
  float sphereEntry(vec3 origin,vec3 direction,vec3 center,float radius){
    vec3 offset=origin-center;
    float projected=dot(offset,direction);
    float shadow=projected*projected-dot(offset,offset)+radius*radius;
    if(shadow<=0.||radius<=0.)return 1.e6;
    float entry=-projected-sqrt(shadow);
    return entry>0.?entry:1.e6;
  }
  vec4 diskVolume(){
    vec3 direction=normalize(localPosition-localCamera);
    float start=length(localPosition-localCamera);
    // Clip the march to the finite cylinder and the opaque central sphere.
    float projected=dot(localCamera,direction);
    float boundRadius=length(vec2(diskOuterRadius,diskHalfThickness));
    float end=-projected+sqrt(max(0.,projected*projected-dot(localCamera,localCamera)+boundRadius*boundRadius));
    if(abs(direction.z)>.0001){
      float first=(-diskHalfThickness-localCamera.z)/direction.z;
      float second=(diskHalfThickness-localCamera.z)/direction.z;
      end=min(end,max(first,second));
    }
    end=min(end,sphereEntry(localCamera,direction,vec3(0.),innerRadius));
    end=min(end,sphereEntry(localCamera,direction,occluderCenter,occluderRadius));
    if(end<=start)return vec4(0.);
    float stepLength=(end-start)/64.;
    vec3 light=vec3(0.);
    float opticalDepth=0.;
    for(int index=0;index<64;index++){
      vec3 samplePosition=localCamera+direction*(start+(float(index)+.5)*stepLength);
      float radius=length(samplePosition.xy);
      // Squared alignment produces identical lobes on opposite radial sides.
      // The disk transform keeps this axis horizontal in the camera view.
      vec2 radialDirection=samplePosition.xy/max(radius,.0001);
      float alignment=dot(radialDirection,bulgeDirection.xy);
      vec3 sheet=plasmaSheet(radius,alignment);
      float rise=sheet.x;
      float sheetThickness=mix(.11,diskBaseHalfThickness,
        smoothstep(1.1,1.65,radius));
      float sheetDistance=abs(abs(samplePosition.z)-rise)/sheetThickness;
      float density=(1.-smoothstep(.30,1.,sheetDistance))
        *smoothstep(innerRadius,innerRadius+.06,length(samplePosition));
      float heat=exp(-max(0.,radius-innerRadius)*1.25);
      float edge=1.-smoothstep(2.5,diskOuterRadius,radius);
      float flow=plasmaFlow(samplePosition,sheet);
      float weight=density*heat*edge*stepLength*8.*(.7+.3*flow);
      vec3 emission=plasmaEmission(heat)*flow;
      // Absorption makes the plasma substantial and hides background stars.
      float sampleOpacity=1.-exp(-weight);
      light+=exp(-opticalDepth)*sampleOpacity*emission;
      opticalDepth+=weight;
    }
    float opacity=1.-exp(-opticalDepth);
    vec3 emission=light/max(opacity,.0001);
    // Compress intense emission together so dense plasma retains its hue.
    return vec4(compressEmission(emission),opacity);
  }
  vec4 plasmaOutput(vec4 plasma){
    #ifdef PLASMA_ATTENUATION
      return vec4(0.,0.,0.,plasma.a);
    #else
      return plasma;
    #endif
  }
  void main(){
    float radius=length(localPosition.xy);
    float coverage=1.;
    if(surfaceKind>.5){
      // The halo compresses the same continuous disk emission around the
      // spherical shadow. Only its spatial mapping differs, not its material.
      vec3 direction=normalize(viewPosition);
      float impact=length(cross(viewCenter,direction))/bodyScale;
      float distance=clamp((impact-innerRadius)/(outerRadius-innerRadius),0.,1.);
      radius=mix(innerRadius,3.5,distance);
      coverage=smoothstep(innerRadius,innerRadius+fwidth(impact),impact);
    }else{
      gl_FragColor=plasmaOutput(diskVolume());
      return;
    }
    float heat=exp(-max(0.,radius-innerRadius)*1.25);
    float edge=1.-smoothstep(2.5,3.5,radius);
    float surfaceRadius=length(plasmaPosition.xy);
    float alignment=dot(plasmaPosition.xy/max(surfaceRadius,.0001),bulgeDirection.xy);
    vec3 sheet=plasmaSheet(surfaceRadius,alignment);
    float flow=plasmaFlow(plasmaPosition,sheet);
    vec3 emission=compressEmission(plasmaEmission(heat)*flow);
    gl_FragColor=plasmaOutput(vec4(emission,coverage*(1.-exp(-edge*heat*3.*(.7+.3*flow)))));
  }
`;

/** Real world-space bodies and disks; opaque spheres own the depth occlusion. */
export function createBinaryBlackHoles(): PluginInstance {
  const eventHorizonRadius = 1;
  const haloOuterRadius = eventHorizonRadius + 0.18;
  const diskOuterRadius = 3.5;
  const diskBaseHalfThickness = 0.25;
  const diskBulgeHeight = 1.05;
  const diskHalfThickness = diskBaseHalfThickness + diskBulgeHeight;
  const object = new Group();
  const disks: Mesh<CylinderGeometry, ShaderMaterial>[] = [];
  const inverseDiskRotation = new Quaternion();
  // Expose the upper disk surface while keeping the rise axis horizontal.
  const viewingInclination = new Quaternion().setFromAxisAngle(
    new Vector3(1, 0, 0),
    (12 * Math.PI) / 180,
  );
  object.name = 'binary-black-holes';
  const bodies = [0xffb85b, 0x65baff].map((color, index) => {
    const body = new Group();
    body.name = index === 0 ? 'amber-black-hole' : 'blue-black-hole';
    body.scale.setScalar(BLACK_HOLE_RADII[index] / ORBIT_TRAVEL_SCALE);
    const sphere = new Mesh(
      new SphereGeometry(eventHorizonRadius, 96, 64),
      new MeshBasicMaterial({color: 0x000000, fog: false}),
    );
    sphere.name = 'opaque-event-horizon';
    body.add(sphere);

    const haloColor = new Color(color);
    const diskMaterial = new ShaderMaterial({
      vertexShader: plasmaVertex,
      fragmentShader: plasmaFragment,
      uniforms: {
        haloColor: {value: haloColor},
        spinDirection: {value: index === 0 ? 1 : -1},
        innerRadius: {value: eventHorizonRadius},
        outerRadius: {value: haloOuterRadius},
        diskNormal: {value: new Vector3()},
        diskAxisX: {value: new Vector3()},
        diskAxisY: {value: new Vector3()},
        plasmaTime: {value: 0},
        diskOuterRadius: {value: diskOuterRadius},
        diskHalfThickness: {value: diskHalfThickness},
        diskBaseHalfThickness: {value: diskBaseHalfThickness},
        diskBulgeHeight: {value: diskBulgeHeight},
        bulgeDirection: {value: new Vector3(1, 0, 0)},
        occluderCenter: {value: new Vector3()},
        occluderRadius: {value: 0},
      },
      transparent: true,
      blending: AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    // Attenuate the background for every cloud first, then add all emitted
    // light. This lets amber and blue overlap without transparent-object
    // sorting allowing one disk to erase the other's color.
    const attenuationMaterial = diskMaterial.clone();
    attenuationMaterial.defines = {PLASMA_ATTENUATION: 1};
    attenuationMaterial.uniforms = diskMaterial.uniforms;
    attenuationMaterial.blending = NormalBlending;
    // A convex closed volume supplies exactly one entry surface per ray.
    // Emission is integrated through its smooth annular density, not painted
    // onto front/back faces of a transparent torus.
    const diskGeometry = new CylinderGeometry(
      diskOuterRadius,
      diskOuterRadius,
      diskHalfThickness * 2,
      192,
    );
    diskGeometry.rotateX(Math.PI / 2);
    diskGeometry.setAttribute(
      'haloSurface',
      new Float32BufferAttribute(
        new Float32Array(diskGeometry.getAttribute('position').count),
        1,
      ),
    );
    const disk = new Mesh(diskGeometry, diskMaterial);
    disks.push(disk);
    disk.name = 'accretion-disk';
    disk.rotation.x = -Math.PI / 2;
    // Both disks share an inclination; volume shading also supports either side.
    disk.rotation.y = 0.2;
    diskMaterial.uniforms.diskNormal.value
      .set(0, 0, 1)
      .applyQuaternion(disk.quaternion);
    diskMaterial.uniforms.diskAxisX.value
      .set(1, 0, 0)
      .applyQuaternion(disk.quaternion);
    diskMaterial.uniforms.diskAxisY.value
      .set(0, 1, 0)
      .applyQuaternion(disk.quaternion);
    const diskAttenuation = new Mesh(diskGeometry, attenuationMaterial);
    diskAttenuation.name = 'disk-attenuation';
    diskAttenuation.quaternion.copy(disk.quaternion);
    diskAttenuation.renderOrder = 1;
    disk.renderOrder = 2;
    body.add(diskAttenuation, disk);

    // A concentric 3D shell keeps the light rim aligned with the spherical
    // shadow for every viewing direction, without a camera-facing transform.
    const halo = new Group();
    halo.name = 'photon-halo';
    const haloGeometry = new SphereGeometry(haloOuterRadius, 96, 64);
    haloGeometry.setAttribute(
      'haloSurface',
      new Float32BufferAttribute(
        new Float32Array(haloGeometry.getAttribute('position').count).fill(1),
        1,
      ),
    );
    const glowShell = new Mesh(haloGeometry, diskMaterial);
    const haloAttenuation = new Mesh(haloGeometry, attenuationMaterial);
    haloAttenuation.name = 'halo-attenuation';
    haloAttenuation.renderOrder = 1;
    glowShell.renderOrder = 2;
    body.add(haloAttenuation);
    halo.add(glowShell);
    body.add(halo);
    const cameraPosition = new Vector3();
    const bodyPosition = new Vector3();
    const cameraUp = new Vector3();
    const towardCamera = new Vector3();
    const horizontal = new Vector3();
    const diskDepth = new Vector3();
    const normal = new Vector3();
    const orientation = new Matrix4();
    const inverseBodyRotation = new Quaternion();
    // Use the actual Three.js camera for all cinematic views, including
    // stationary shots. Only plasma rotates; the opaque body stays in place.
    const faceCamera: typeof disk.onBeforeRender = (
      _renderer,
      _scene,
      camera,
    ) => {
      camera.getWorldPosition(cameraPosition);
      body.getWorldPosition(bodyPosition);
      towardCamera.copy(cameraPosition).sub(bodyPosition).normalize();
      cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      horizontal.crossVectors(cameraUp, towardCamera).normalize();
      if (horizontal.lengthSq() < 1e-8) {
        horizontal.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      }
      diskDepth.copy(towardCamera).negate();
      normal.crossVectors(horizontal, diskDepth).normalize();
      orientation.makeBasis(horizontal, diskDepth, normal);
      body.getWorldQuaternion(inverseBodyRotation).invert();
      disk.quaternion
        .setFromRotationMatrix(orientation)
        .premultiply(inverseBodyRotation)
        .multiply(viewingInclination);
      diskAttenuation.quaternion.copy(disk.quaternion);
      disk.updateMatrixWorld(true);
      diskAttenuation.updateMatrixWorld(true);
      diskMaterial.uniforms.diskAxisX.value
        .set(1, 0, 0)
        .applyQuaternion(disk.quaternion);
      diskMaterial.uniforms.diskAxisY.value
        .set(0, 1, 0)
        .applyQuaternion(disk.quaternion);
      diskMaterial.uniforms.diskNormal.value
        .set(0, 0, 1)
        .applyQuaternion(disk.quaternion);
      diskMaterial.uniforms.bulgeDirection.value.set(1, 0, 0);
      // Re-express the other opaque body in the newly rotated disk frame.
      bodies[1 - index].getWorldPosition(
        diskMaterial.uniforms.occluderCenter.value,
      );
      body.worldToLocal(diskMaterial.uniforms.occluderCenter.value);
      inverseDiskRotation.copy(disk.quaternion).invert();
      diskMaterial.uniforms.occluderCenter.value.applyQuaternion(
        inverseDiskRotation,
      );
    };
    for (const mesh of [diskAttenuation, disk, haloAttenuation, glowShell]) {
      mesh.onBeforeRender = faceCamera;
    }
    object.add(body);
    return body;
  });
  return {
    object,
    update(frame) {
      const project = frame.projectWorldPoint;
      if (project == null) {
        object.visible = false;
        return;
      }
      object.visible = true;
      binaryCenters(frame.time).forEach((center, index) => {
        bodies[index].position.fromArray(
          project([center[0], center[1], center[2]]),
        );
      });
      bodies.forEach((body, index) => {
        const other = bodies[1 - index];
        const disk = disks[index];
        disk.material.uniforms.plasmaTime.value = frame.reduced
          ? 0
          : frame.time * PLASMA_FLOW_SPEED;
        inverseDiskRotation.copy(disk.quaternion).invert();
        disk.material.uniforms.occluderCenter.value
          .copy(other.position)
          .sub(body.position)
          .divideScalar(body.scale.x)
          .applyQuaternion(inverseDiskRotation);
        disk.material.uniforms.bulgeDirection.value.set(1, 0, 0);
        disk.material.uniforms.occluderRadius.value =
          other.scale.x / body.scale.x;
      });
    },
    dispose() {
      disposeObject3D(object);
    },
  };
}
