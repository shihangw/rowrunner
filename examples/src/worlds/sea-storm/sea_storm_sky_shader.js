// Internal GLSL fragments composed by the shared sky pass.
export const stormSkyFunctions = `      float stormDetail(vec2 p){
        float sum=0.,weight=.52;
        mat2 turn=mat2(.80,-.60,.60,.80);
        for(int i=0;i<5;i++){
          sum+=noise(p)*weight;p=turn*p*2.03+vec2(11.7,5.3);weight*=.48;
        }
        return sum;
      }
`;
export const stormSkyBody = `          // A continuous cloud ceiling in world coordinates follows camera turns
          // and travel. Warped noise gives soft billows instead of solid spheres.
          vec2 screen=(uv*2.-1.)*vec2(aspect,1.)*skyLens;
          vec3 ray=normalize(skyForward+skyRight*screen.x+skyUp*screen.y);
          float reach=max(80.,620.-skyEye.y)/max(.035,ray.y);
          vec2 wind=vec2(time*.009,time*.003);
          vec2 p=(skyEye.xz+ray.xz*reach)*.0024+wind;
          vec2 warp=vec2(clouds(p*.43),clouds(p*.43+17.3))-.5;
          vec2 q=p+warp*1.8;
          float detail=stormDetail(q);
          float mass=clouds(q*.44+4.7);
          float density=smoothstep(.20,.79,detail*.72+mass*.28);
          // Broad shadowed undersides, cool scattered light on thinner edges,
          // and a higher veil keep the storm overcast even between billows.
          float light=clamp(.53+(clouds(q+vec2(-.32,.18))-detail)*2.5,0.,1.);
          vec3 cloudColor=mix(vec3(.27,.32,.35),vec3(.038,.052,.068),density);
          cloudColor+=vec3(.12,.135,.14)*light*(.35+.65*density);
          float horizon=smoothstep(.015,.22,ray.y);
          vec3 weather=mix(skyBottom*.92,cloudColor,horizon);
          float rain=clouds(vec2(ray.x*18.+ray.z*11.+time*.014,ray.y*2.));
          weather-=vec3(.028,.034,.038)*rain*(1.-horizon);
          float glow=pow(max(0.,dot(ray,normalize(vec3(-.45,.32,.84)))),8.);
          weather+=vec3(.18,.23,.29)*lightning*(.16+glow*.84)*(1.-density*.35);
          col=mix(col,weather,1.-transition);
`;
