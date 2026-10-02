import type { ICameraBasis } from '../math/camera-basis';
import type { IHalfTangents } from '../math/field-of-view';
import { type ISurfaceQuad, SURFACE_NEAR_PLANE } from '../math/surface-geometry';
import { writeCameraMatrix } from './camera-matrix';
import { createShaderProgram } from './shader-program';
import { SURFACE_FRAGMENT_SHADER } from './shaders/surface-fragment';
import { SURFACE_VERTEX_SHADER } from './shaders/surface-vertex';

/**
 * Поверхность в кадре: её текстура и прямоугольник относительно камеры этого кадра.
 */
export interface ISurfaceDrawing {
  texture: WebGLTexture;
  quad: ISurfaceQuad;
}

export interface ISurfacePass {
  draw: (
    camera: { basis: ICameraBasis; halfTangents: IHalfTangents },
    surfaces: readonly ISurfaceDrawing[],
  ) => void;
  dispose: () => void;
}

const SURFACE_UNIFORMS = [
  'cameraToWorld',
  'halfTangents',
  'nearPlane',
  'origin',
  'across',
  'down',
  'source',
] as const;
const QUAD_VERTEX_COUNT = 4;
const TEXTURE_UNIT = 0;

/**
 * Проход поверхностей после слоёв панорамы, в тот же буфер. Поверхности приходят уже в порядке от дальних к
 * ближним; проверка глубины `LESS` с записью разрешает пересечения попиксельно, а смешивание с
 * предумноженной альфой — полупрозрачные края. Задняя сторона не отсекается: табличку видно и со спины,
 * как элемент хотспота.
 */
export const createSurfacePass = (gl: WebGL2RenderingContext): ISurfacePass => {
  const program = createShaderProgram(
    gl,
    { vertex: SURFACE_VERTEX_SHADER, fragment: SURFACE_FRAGMENT_SHADER },
    SURFACE_UNIFORMS,
  );
  const cameraMatrix = new Float32Array(9);

  const setVector = (name: 'origin' | 'across' | 'down', vector: ISurfaceQuad['origin']): void => {
    gl.uniform3f(program.uniform(name), vector.x, vector.y, vector.z);
  };

  return {
    draw: (camera, surfaces) => {
      if (surfaces.length === 0) {
        return;
      }

      gl.useProgram(program.program);
      gl.uniformMatrix3fv(
        program.uniform('cameraToWorld'),
        false,
        writeCameraMatrix(cameraMatrix, camera.basis),
      );
      gl.uniform2f(program.uniform('halfTangents'), camera.halfTangents.width, camera.halfTangents.height);
      gl.uniform1f(program.uniform('nearPlane'), SURFACE_NEAR_PLANE);
      gl.uniform1i(program.uniform('source'), TEXTURE_UNIT);
      gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      for (const surface of surfaces) {
        setVector('origin', surface.quad.origin);
        setVector('across', surface.quad.across);
        setVector('down', surface.quad.down);
        gl.bindTexture(gl.TEXTURE_2D, surface.texture);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, QUAD_VERTEX_COUNT);
      }

      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
    },
    dispose: () => {
      gl.deleteProgram(program.program);
    },
  };
};
