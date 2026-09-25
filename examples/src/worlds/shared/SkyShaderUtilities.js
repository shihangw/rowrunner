import { stormSkyFunctions, stormSkyBody } from '../sea-storm/SeaStormSkyShader.js';
import { binarySkyFunctions, binarySkyBody } from '../binary-eclipse/BinaryEclipseSkyShader.js';
import { matrixSkyBody } from '../matrix/MatrixSkyShader.js';

export const fragment = `
      precision highp float; varying vec2 uv;
      uniform vec3 skyTop,skyBottom,accent; uniform float aspect,biome,time,transition,lightning;
      uniform vec3 skyEye,skyRight,skyUp,skyForward;uniform float skyLens;
      uniform vec3 holeA,holeB;uniform vec2 holeRadii;uniform float skyHeight;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
      }
      float clouds(vec2 p){return noise(p)*.55+noise(p*2.1+3.7)*.28+noise(p*4.3+8.1)*.17;}
      ${stormSkyFunctions}
      ${binarySkyFunctions}
      void main(){
        vec3 col=mix(skyBottom,skyTop,smoothstep(.48,1.,uv.y));
        float haze=exp(-pow((uv.y-.48)*6.,2.));
        col+=accent*haze*.07;
        if(biome<4.5){
          if(biome<.5||biome>2.5){
            vec2 grid=uv*vec2(400.*aspect,400.);vec2 cell=floor(grid);
            float star=pow(max(0.,1.-length(fract(grid)-.5)*2.),7.)*step(.995,hash(cell));
            col+=vec3(.65,.8,1.)*star*smoothstep(.32,.9,uv.y)*.75*(1.-transition);
          }
          vec2 p=(uv-vec2(.76,.73))*vec2(aspect,1.);float r=length(p);
          float radius=biome>3.5?.17:.11;
          if(biome<.5||biome>2.5){
            float disc=1.-smoothstep(radius-.001,radius+.001,r);
            float sphere=sqrt(max(0.,1.-r*r/(radius*radius)));
            float shade=clamp(.25+sphere*.65-p.x*3.,.05,1.);
            float bands=.90+.10*sin(p.y*170.+sin(p.y*57.)*2.);
            col=mix(col,accent*shade*bands*.8,disc*(1.-transition));
            col+=accent*exp(-abs(r-radius)*130.)*.12*(1.-transition);
            if(biome>3.5){
              vec2 q=mat2(.94,-.34,.34,.94)*p;
              float ring=length(q*vec2(1.,3.5));
              float mask=smoothstep(radius*1.16,radius*1.25,ring)*(1.-smoothstep(radius*1.7,radius*1.78,ring));
              col=mix(col,accent*.7,mask*.5*(1.-disc)*(1.-transition));
            }
          }
          if(biome>3.5){
            float wave=.67+.055*sin(uv.x*9.+time*.035)+.025*sin(uv.x*21.);
            float aurora=exp(-abs(uv.y-wave)*38.)*(.4+.3*sin(uv.x*55.));
            col+=vec3(.12,.55,.4)*aurora*.35*(1.-transition);
          }
        }else if(biome<5.5){
          ${matrixSkyBody}
        }
        if(biome>5.5&&biome<6.5){
          ${stormSkyBody}
        }
        if(biome>6.5){
          ${binarySkyBody}
        }
        gl_FragColor=vec4(col,1.);
      }
    `;

import { stormFlash } from '../sea-storm/SeaStormGeometry.js';
import { binaryCenters, BLACK_HOLE_RADII } from '../binary-eclipse/BinaryEclipseOrbit.js';
export function worldSky(biome) {
  return Object.freeze({
    fragment,
    uniforms({ time, reduced }) {
      const [holeA, holeB] = binaryCenters();
      return {
        biome,
        lightning: biome === 6 ? stormFlash(time, reduced) : 0,
        holeA,
        holeB,
        holeRadii: BLACK_HOLE_RADII,
      };
    },
  });
}
