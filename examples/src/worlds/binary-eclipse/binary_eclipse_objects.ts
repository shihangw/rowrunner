import {
  AdditiveBlending,
  Color,
  Float32BufferAttribute,
  Group,
  CylinderGeometry,
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

const plasmaVertex = `
  attribute float haloSurface;
  uniform float spinDirection;
  uniform vec3 diskNormal;
  varying vec3 localPosition,viewPosition,viewCenter,viewVelocity,localCamera;
  varying float bodyScale,surfaceKind;
  void main(){
    localPosition=position;
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
    if(haloSurface>.5){
      vec3 radial=(modelMatrix*vec4(position,0.)).xyz;
      vec3 tangent=cross(diskNormal,radial)*spinDirection;
      viewVelocity=(viewMatrix*vec4(tangent,0.)).xyz/max(length(radial),.0001);
    }else{
      vec3 tangent=vec3(-position.y,position.x,0.)*spinDirection;
      viewVelocity=normalize((modelViewMatrix*vec4(tangent,0.)).xyz);
    }
    gl_Position=projectionMatrix*vec4(viewPosition,1.);
  }
`;
// A bounded Doppler approximation for the example's continuous light surfaces.
// Evaluate in view space so the approaching side follows camera and disk tilt.
const dopplerFunctions = `
  float dopplerBoost(vec3 velocity,vec3 position,float radius){
    float speed=.38/sqrt(max(radius,1.));
    vec3 direction=velocity/max(length(velocity),1.);
    float approach=dot(direction,normalize(-position));
    float doppler=sqrt(1.-speed*speed)/(1.-speed*approach);
    return clamp(doppler*doppler*doppler,.20,3.);
  }
`;
const plasmaFragment = `
  uniform vec3 haloColor;
  uniform vec3 occluderCenter;
  uniform float occluderRadius;
  uniform float innerRadius,outerRadius,diskOuterRadius,diskHalfThickness,spinDirection;
  varying vec3 localPosition,viewPosition,viewCenter,viewVelocity,localCamera;
  varying float bodyScale,surfaceKind;
  ${dopplerFunctions}
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
    float middleRadius=(innerRadius+diskOuterRadius)*.5;
    float radialWidth=(diskOuterRadius-innerRadius)*.5;
    vec3 light=vec3(0.);
    float opticalDepth=0.;
    for(int index=0;index<64;index++){
      vec3 samplePosition=localCamera+direction*(start+(float(index)+.5)*stepLength);
      float radius=length(samplePosition.xy);
      float radial=(radius-middleRadius)/radialWidth;
      float height=samplePosition.z/diskHalfThickness;
      float density=1.-smoothstep(.35,1.,radial*radial+height*height);
      float heat=exp(-max(0.,radius-innerRadius)*1.25);
      float edge=1.-smoothstep(2.5,diskOuterRadius,radius);
      float weight=density*heat*edge*stepLength*1.2;
      vec3 velocity=vec3(-samplePosition.y,samplePosition.x,0.)*spinDirection/max(radius,.0001);
      float boost=dopplerBoost(velocity,samplePosition-localCamera,radius);
      vec3 emission=mix(haloColor,vec3(1.),heat*.65)*3.*boost;
      light+=emission*weight;
      opticalDepth+=weight;
    }
    return vec4(light/max(opticalDepth,.0001),1.-exp(-opticalDepth));
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
      gl_FragColor=diskVolume();
      return;
    }
    float heat=exp(-max(0.,radius-innerRadius)*1.25);
    float edge=1.-smoothstep(2.5,3.5,radius);
    // Concentrate the hottest emission at the inner rim while retaining
    // the blue/gold tint through the cooler outer glow.
    vec3 emission=mix(haloColor,vec3(1.),heat*.80);
    float boost=dopplerBoost(viewVelocity,viewPosition,radius);
    gl_FragColor=vec4(emission*6.*boost,coverage*edge*heat*.95);
  }
`;

/** Real world-space bodies and disks; opaque spheres own the depth occlusion. */
export function createBinaryBlackHoles(): PluginInstance {
  const eventHorizonRadius = 1;
  const haloOuterRadius = eventHorizonRadius + 0.18;
  const diskOuterRadius = 3.5;
  const diskHalfThickness = 0.25;
  const object = new Group();
  const disks: Mesh<CylinderGeometry, ShaderMaterial>[] = [];
  const inverseDiskRotation = new Quaternion();
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
        diskOuterRadius: {value: diskOuterRadius},
        diskHalfThickness: {value: diskHalfThickness},
        occluderCenter: {value: new Vector3()},
        occluderRadius: {value: 0},
      },
      transparent: true,
      blending: AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
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
    body.add(disk);

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
    halo.add(glowShell);
    body.add(halo);
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
        inverseDiskRotation.copy(disk.quaternion).invert();
        disk.material.uniforms.occluderCenter.value
          .copy(other.position)
          .sub(body.position)
          .divideScalar(body.scale.x)
          .applyQuaternion(inverseDiskRotation);
        disk.material.uniforms.occluderRadius.value =
          other.scale.x / body.scale.x;
      });
    },
    dispose() {
      disposeObject3D(object);
    },
  };
}
