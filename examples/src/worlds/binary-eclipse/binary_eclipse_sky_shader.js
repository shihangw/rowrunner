// Internal GLSL fragments composed by the shared sky pass.
export const binarySkyFunctions = `      float fixedStars(vec3 ray,float footprintScale){
        const float pi=3.14159265359;
        float latitude=asin(clamp(ray.y,-1.,1.));
        float longitude=atan(ray.z,ray.x);
        float row=floor((latitude/pi+.5)*160.);
        float pixel=2.*skyLens/skyHeight*footprintScale;
        float light=0.;
        // Sample neighboring sky cells as well as the current one so a star's
        // soft footprint survives cell boundaries. Positions never depend on time.
        for(int y=-1;y<=1;y++){
          float iy=row+float(y);
          if(iy<0.||iy>159.)continue;
          float lat=((iy+.5)/160.-.5)*pi;
          float columns=max(3.,floor(320.*cos(lat)));
          float column=floor((longitude/(2.*pi)+.5)*columns);
          for(int x=-1;x<=1;x++){
            float ix=mod(column+float(x)+columns,columns);
            vec2 cell=vec2(ix,iy);
            float seed=hash(cell+19.7);
            if(seed>.15){
              float theta=((ix+.2+.6*hash(cell+3.1))/columns-.5)*2.*pi;
              float phi=((iy+.2+.6*hash(cell+8.4))/160.-.5)*pi;
              vec3 star=vec3(cos(phi)*cos(theta),sin(phi),cos(phi)*sin(theta));
              vec3 delta=ray-star;
              // A minimum pixel-sized Gaussian replaces subpixel, hard peaks.
              float sigma=pixel*(.55+.25*hash(cell+5.8));
              // Preserve the bright population and fill previously empty cells
              // with dimmer stars, using fixed seeds to avoid twinkling.
              float brightness=seed>.65?(.10+.45*pow(seed,4.))
                :mix(.012,.065,(seed-.15)/.50);
              light+=exp(-dot(delta,delta)/(2.*sigma*sigma))*brightness;
            }
          }
        }
        return light;
      }
      vec3 gravitationalDeflection(vec3 ray,vec3 center,float radius,out float footprintScale,out float rimDistance){
        vec3 offset=center-skyEye;
        float distance=length(offset);
        vec3 forward=offset/distance;
        float facing=dot(ray,forward);
        footprintScale=1.;
        rimDistance=10000.;
        if(facing<=0.)return vec3(0.);
        vec3 transverse=ray-forward*facing;
        float r=length(transverse)/facing*distance/radius;
        // Map source radius to r - .995 * exp(-.18 * (r - 1)).
        // The nominal edge stretch is 1 / (1 - .995) = 200x.
        // Its positive slope prevents foldover; its tangential stretch grows
        // toward the shadow instead of diverging in a detached outer ring.
        // This is an art-directed lens, not a relativistic ray tracer.
        float gap=max(r-1.,0.);
        rimDistance=min(gap,10000.);
        float displacement=.995*exp(-.18*gap);
        float strength=displacement/max(r,1.);
        float tangentialScale=1.-strength;
        float radialScale=r>1.?1.+.18*displacement:tangentialScale;
        // Correct the radial derivative for the angular ray projection.
        float tangent=length(transverse)/facing;
        float sourceTangent=tangent*tangentialScale;
        radialScale*=(1.+tangent*tangent)/(1.+sourceTangent*sourceTangent);
        footprintScale=clamp(radialScale,1.,4.);
        return transverse*strength;
      }
`;
export const binarySkyBody = `          vec2 screen=(uv*2.-1.)*vec2(aspect,1.)*skyLens;
          vec3 ray=normalize(skyForward+skyRight*screen.x+skyUp*screen.y);
          float footprintA,footprintB,rimA,rimB;
          // Evaluate both lenses in the original camera frame. Feeding A's
          // bent ray into B moves B's apparent center away from its 3D body.
          vec3 deflectionA=gravitationalDeflection(ray,holeA,holeRadii.x,footprintA,rimA);
          vec3 deflectionB=gravitationalDeflection(ray,holeB,holeRadii.y,footprintB,rimB);
          // Give each visible rim its own centered mapping, blending smoothly
          // between the holes instead of adding two near-critical deflections.
          float weightA=pow(rimB,4.);
          float weightB=pow(rimA,4.);
          float totalWeight=weightA+weightB;
          float blendA=totalWeight>0.?weightA/totalWeight:.5;
          vec3 deflection=mix(deflectionB,deflectionA,blendA);
          vec3 backgroundRay=normalize(ray-deflection);
          vec2 space=vec2(atan(backgroundRay.z,backgroundRay.x),asin(clamp(backgroundRay.y,-1.,1.)))*vec2(2.,2.);
          float mist=clouds(space*3.4);
          col=vec3(.002,.003,.008)+vec3(.022,.018,.037)*pow(mist,3.);
          col+=vec3(.72,.79,1.)*fixedStars(backgroundRay,mix(footprintB,footprintA,blendA));
          // Roll off highlights together, preserving each halo's color at overlaps.
          col*=1.35;
          float highlight=max(col.r,max(col.g,col.b));
          col*=(1.-exp(-highlight))/max(highlight,.0001);
          col=mix(col,skyBottom,transition);
`;
