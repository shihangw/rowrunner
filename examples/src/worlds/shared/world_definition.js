import {defineWorld as define} from 'rowrunner/plugins';
import {SPACE_MODELS} from '../../assets/space-kit.js';
import {worldSky} from './sky_shader_utilities.js';
export function defineWorld({
  ground = false,
  guideLights = true,
  sky = 0,
  draw,
  ...definition
}) {
  return define({
    ...definition,
    sky: worldSky(sky),
    draw(geometryBuilder, sceneFrame) {
      const {
        distance,
        centerX,
        palette,
        near,
        far,
        roadLight = () => palette.accent,
      } = sceneFrame;
      if (ground) {
        geometryBuilder.quad(
          [-2000, -1, near - 400],
          [2000, -1, near - 400],
          [2000, -1, far + 400],
          [-2000, -1, far + 400],
          palette.ground,
        );
      }
      draw(
        Object.create(geometryBuilder, {
          model: {
            value: (name, ...args) =>
              geometryBuilder.model(SPACE_MODELS[name], ...args),
          },
        }),
        sceneFrame,
      );
      if (guideLights) {
        for (
          let i = Math.floor((distance + near) / 24);
          i < Math.ceil((distance + far) / 24);
          i++
        ) {
          const z = i * 24 - distance;
          for (const side of [-1, 1]) {
            const x = centerX(z) + side * 8.1;
            geometryBuilder.box(x, -1, z, 0.3, 1.8, 0.6, [0.1, 0.16, 0.2]);
            geometryBuilder.box(x, 0.8, z, 0.34, 0.16, 0.65, roadLight(z));
          }
        }
      }
    },
  });
}
