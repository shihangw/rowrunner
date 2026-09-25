// Internal GLSL fragments composed by the shared sky pass.
export const matrixSkyBody = `          // Distant code rain: small pixel glyphs with independently falling heads.
          vec2 cells=vec2(uv.x*aspect*42.,(1.-uv.y)*34.);
          vec2 cell=floor(cells),local=fract(cells);
          float seed=hash(vec2(cell.x,17.));
          float head=mod(time*(1.5+seed*2.2)+seed*61.,52.);
          float tail=mod(head-cell.y+52.,52.);
          vec2 pixel=floor(local*vec2(4.,6.));
          float ink=step(.48,hash(vec2(cell.x*13.+cell.y*7.+pixel.x,pixel.y+cell.y*3.)));
          ink*=1.-step(3.,pixel.x);ink*=1.-step(5.,pixel.y);
          float trail=(1.-smoothstep(0.,14.,tail))*step(.28,seed);
          float lead=1.-smoothstep(0.,1.,tail);
          vec3 code=mix(accent*.22,vec3(.55,1.,.66),lead*.55);
          col+=code*ink*trail*smoothstep(.22,.7,uv.y)*(1.-transition);
`;
