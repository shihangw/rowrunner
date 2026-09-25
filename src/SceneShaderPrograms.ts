export const fullscreen = `attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
export const skyVertex = fullscreen;
export const skyFragment = `
precision highp float; varying vec2 uv;
uniform vec3 skyTop, skyBottom;
void main(){gl_FragColor=vec4(mix(skyBottom,skyTop,smoothstep(0.,1.,uv.y)),1.);}
`;
export const geometryVertex = `
      attribute vec3 position,color; uniform mat4 view,projection;
      varying vec3 vColor; varying float depth;
      void main(){vec4 p=view*vec4(position,1.);depth=-p.z;vColor=color;gl_Position=projection*p;}
    `;
export const geometryFragment = `
      precision mediump float; varying vec3 vColor; varying float depth;
      uniform vec3 fogColor;uniform float transition,fogDistance;
      void main(){float fog=1.-exp(-pow(max(0.,depth)/fogDistance,1.7));fog=mix(fog,1.,transition);
        gl_FragColor=vec4(mix(vColor,fogColor,min(.98,fog)),1.);}
    `;
export const particleProgramVertex = `
      attribute vec3 position,color; attribute vec2 corner,shape;
      uniform mat4 view,projection;
      varying vec2 uv; varying vec3 vColor; varying float opacity,depth;
      void main(){
        vec4 p=view*vec4(position,1.);depth=-p.z;
        p.xy+=corner*shape.x;gl_Position=projection*p;
        uv=corner;vColor=color;opacity=shape.y;
      }
    `;
export const particleProgramFragment = `
      precision mediump float;
      varying vec2 uv; varying vec3 vColor; varying float opacity,depth;
      uniform float transition,fogDistance;
      void main(){
        float r=dot(uv,uv);if(r>=1.)discard;
        float soft=exp(-r*4.)*(1.-smoothstep(.5,1.,r));
        float visibility=exp(-pow(max(0.,depth)/fogDistance,1.7))*(1.-transition);
        vec3 fire=mix(vColor,vec3(1.),.22*exp(-r*12.));
        gl_FragColor=vec4(fire,soft*opacity*visibility);
      }
    `;
export const glassProgramVertex = `
      attribute vec3 position,normal,color; attribute float opacity;
      uniform mat4 view,projection;
      varying vec3 vNormal,vColor,vPosition; varying float vOpacity;
      void main(){
        vec4 p=view*vec4(position,1.);vPosition=p.xyz;
        vNormal=mat3(view)*normal;vColor=color;vOpacity=opacity;
        gl_Position=projection*p;
      }
    `;
export const glassProgramFragment = `
      precision mediump float;
      uniform sampler2D backdrop; uniform vec2 viewport;
      uniform vec3 skyTop,skyBottom; uniform float transition,fogDistance;
      varying vec3 vNormal,vColor,vPosition; varying float vOpacity;
      void main(){
        vec3 n=normalize(vNormal),eye=normalize(-vPosition);
        if(dot(n,eye)<0.)n=-n;
        float fresnel=pow(1.-max(0.,dot(n,eye)),3.);
        vec2 uv=clamp(gl_FragCoord.xy/viewport+n.xy*.007,vec2(.002),vec2(.998));
        vec3 transmitted=texture2D(backdrop,uv).rgb*mix(vec3(1.),vColor,.25);
        vec3 reflection=mix(skyBottom,skyTop,clamp(n.y*.5+.5,0.,1.))+vColor*.55;
        float shine=pow(max(0.,dot(n,normalize(eye+normalize(vec3(-.4,.8,.6))))),70.);
        float rim=pow(max(0.,dot(n,normalize(vec3(.7,.2,.65)))),28.);
        vec3 glass=mix(transmitted,reflection,.28+fresnel*.58)+vec3(shine*.9)+vColor*rim*.24;
        float fog=1.-exp(-pow(max(0.,-vPosition.z)/fogDistance,1.7));
        gl_FragColor=vec4(mix(glass,skyBottom,min(.98,fog)),vOpacity*(1.-transition));
      }
    `;
export const postVertex = fullscreen;
export const postFragment = `
      precision mediump float;varying vec2 uv;uniform sampler2D frameTexture;uniform vec2 pixel;uniform float transition;uniform vec3 fogColor;
      vec3 glow(vec2 p){vec3 c=texture2D(frameTexture,p).rgb;float hi=max(c.r,max(c.g,c.b));float lo=min(c.r,min(c.g,c.b));return c*smoothstep(.65,.95,hi)*smoothstep(.15,.45,hi-lo);}
      void main(){
        vec3 base=texture2D(frameTexture,uv).rgb;vec3 bloom=vec3(0.);
        vec3 north=texture2D(frameTexture,uv+vec2(0.,pixel.y)).rgb,south=texture2D(frameTexture,uv-vec2(0.,pixel.y)).rgb;
        vec3 east=texture2D(frameTexture,uv+vec2(pixel.x,0.)).rgb,west=texture2D(frameTexture,uv-vec2(pixel.x,0.)).rgb;
        float edge=length(north-south)+length(east-west);
        base=mix(base,(base*2.+north+south+east+west)/6.,smoothstep(.12,.65,edge)*.7);
        for(int i=1;i<=3;i++){float r=float(i)*2.5;bloom+=glow(uv+pixel*vec2(r,0.))+glow(uv-pixel*vec2(r,0.))+glow(uv+pixel*vec2(0.,r))+glow(uv-pixel*vec2(0.,r));}
        vec3 col=base+bloom*.055;
        float vignette=1.-.18*pow(length((uv-.5)*vec2(1.,.8)),1.5);
        gl_FragColor=vec4(mix(col*vignette,fogColor,transition),1.);
      }
    `;
