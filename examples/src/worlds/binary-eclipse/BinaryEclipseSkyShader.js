// Internal GLSL fragments composed by the shared sky pass.
export const binarySkyFunctions = `      float fixedStars(vec3 ray){
        const float pi=3.14159265359;
        float latitude=asin(clamp(ray.y,-1.,1.));
        float longitude=atan(ray.z,ray.x);
        float row=floor((latitude/pi+.5)*96.);
        float pixel=2.*skyLens/skyHeight;
        float light=0.;
        // Sample neighboring sky cells as well as the current one so a star's
        // soft footprint survives cell boundaries. Positions never depend on time.
        for(int y=-1;y<=1;y++){
          float iy=row+float(y);
          if(iy<0.||iy>95.)continue;
          float lat=((iy+.5)/96.-.5)*pi;
          float columns=max(3.,floor(192.*cos(lat)));
          float column=floor((longitude/(2.*pi)+.5)*columns);
          for(int x=-1;x<=1;x++){
            float ix=mod(column+float(x)+columns,columns);
            vec2 cell=vec2(ix,iy);
            float seed=hash(cell+19.7);
            if(seed>.86){
              float theta=((ix+.2+.6*hash(cell+3.1))/columns-.5)*2.*pi;
              float phi=((iy+.2+.6*hash(cell+8.4))/96.-.5)*pi;
              vec3 star=vec3(cos(phi)*cos(theta),sin(phi),cos(phi)*sin(theta));
              vec3 delta=ray-star;
              // A minimum pixel-sized Gaussian replaces subpixel, hard peaks.
              float sigma=pixel*(.70+.32*hash(cell+5.8));
              light+=exp(-dot(delta,delta)/(2.*sigma*sigma))*(.24+.36*seed);
            }
          }
        }
        return light;
      }
      vec3 blackHole(vec3 background,vec3 ray,vec3 center,float radius,float tilt,vec3 haloColor){
        vec3 offset=center-skyEye;
        float distance=length(offset);
        vec3 forward=offset/distance;
        float facing=dot(ray,forward);
        if(facing<=0.)return background;
        vec3 right=normalize(cross(vec3(0.,1.,0.),forward));
        vec3 up=cross(forward,right);
        vec2 p=vec2(dot(ray,right),dot(ray,up))/facing*distance/radius;
        p=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*p;
        // Conservative projected pixel footprint filters thin disk bands at
        // oblique angles and at small canvas sizes without derivative extensions.
        float pixel=2.*skyLens/skyHeight*distance/radius/max(.05,facing*facing);
        float r=length(p);
        if(r>5.)return background;
        float angle=atan(p.y,p.x);
        float edge=max(.015,pixel);
        float shadow=1.-smoothstep(1.-edge,1.+edge,r);
        vec3 col=background*(1.-shadow);
        // Thin luminous paths curl above and below the shadow: a stylized
        // lensed view of the far disk, separate from the foreground disk.
        float lensRadius=1.075+.14*abs(p.x)/max(r,.001);
        float lensWidth=max(1./24.,pixel),rimWidth=max(1./95.,pixel);
        float lens=exp(-abs(r-lensRadius)/lensWidth)*.78/(24.*lensWidth);
        lens+=exp(-abs(r-1.025)/rimWidth)*.80/(95.*rimWidth);
        float strands=.85+.15*sin(r*48.+sin(angle*5.))*exp(-.5*pow(pixel*48.,2.));
        float top=smoothstep(-.35,.3,p.y);
        vec3 warm=haloColor;
        col+=mix(warm,mix(haloColor,vec3(1.),.72),top*.72)*lens*strands*(.50+top*.80);
        // A shallow disk spans the shadow, with a bowed far edge and an
        // uninterrupted near edge. Fine radial filaments replace solid rings.
        float bend=.30*exp(-p.x*p.x*.7);
        float y=p.y+.24-bend*smoothstep(-.1,.35,p.y);
        float diskRadius=length(vec2(p.x,y/.20));
        float disk=smoothstep(1.02,1.23,diskRadius)*(1.-smoothstep(2.65,3.8,diskRadius));
        float diskAngle=atan(y/.20,p.x);
        // Elliptical compression amplifies the sampling footprint fivefold.
        // Unresolvable bands fade to their mean instead of beating against pixels.
        float diskPixel=pixel*5.;
        float threads=.68+.12*sin(diskRadius*24.+sin(diskAngle*5.)*1.4)*exp(-.5*pow(diskPixel*24.,2.))
          +.05*sin(diskRadius*49.+diskAngle*7.)*exp(-.5*pow(diskPixel*49.,2.));
        float heat=exp(-(diskRadius-1.2)*.65);
        float visible=max(1.-shadow,1.-smoothstep(-.16,-.04,p.y));
        float bright=clamp(1.1-p.x*.20,.35,1.6);
        vec3 emission=mix(haloColor*.52,mix(haloColor,vec3(1.),.72),clamp(heat,0.,1.));
        col+=emission*disk*threads*heat*bright*visible*1.8;
        // Broad low-energy glow gives bright filaments a soft photographic edge.
        float halo=exp(-abs(r-1.14)*5.)*.085;
        float diskGlow=exp(-abs(y)*7.)*exp(-abs(p.x)*.5)*.10;
        col+=warm*(halo+diskGlow)*(1.-shadow);
        return col;
      }
`;
export const binarySkyBody = `          vec2 screen=(uv*2.-1.)*vec2(aspect,1.)*skyLens;
          vec3 ray=normalize(skyForward+skyRight*screen.x+skyUp*screen.y);
          vec2 space=vec2(atan(ray.z,ray.x),asin(ray.y))*vec2(2.,2.);
          float mist=clouds(space*3.4);
          col=vec3(.002,.003,.008)+vec3(.022,.018,.037)*pow(mist,3.);
          col+=vec3(.72,.79,1.)*fixedStars(ray);
          // Distant objects are shaded by world-space viewing rays, so local
          // road depth/fog and clipping planes cannot shrink or erase them.
          if(length(holeA-skyEye)>length(holeB-skyEye)){
            col=blackHole(col,ray,holeA,holeRadii.x,-.10,vec3(1.,.65,.26));
            col=blackHole(col,ray,holeB,holeRadii.y,.30,vec3(.24,.64,1.));
          }else{
            col=blackHole(col,ray,holeB,holeRadii.y,.30,vec3(.24,.64,1.));
            col=blackHole(col,ray,holeA,holeRadii.x,-.10,vec3(1.,.65,.26));
          }
          col=mix(col,skyBottom,transition);
`;
