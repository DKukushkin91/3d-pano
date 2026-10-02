import { createShaderProgram } from './shader-program';
import { COMPOSITE_FRAGMENT_SHADER } from './shaders/composite-fragment';
import { FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen-vertex';

/**
 * Радиальное размытие шага: сила 0…1 и центр в текстурных координатах кадра (0…1, `y` снизу).
 */
export interface ICompositeBlur {
  strength: number;
  center: { x: number; y: number };
}

/**
 * Что сводит проход: вес текущего кадра, размытие (или `null`) и размер буфера.
 */
export interface ICompositeSettings {
  weight: number;
  blur: ICompositeBlur | null;
  width: number;
  height: number;
}

/**
 * Проход смешивания: рисует в canvas два кадра-текстуры с весом текущего, во время шага — с радиальным
 * размытием к точке шага.
 */
export interface ICompositePass {
  draw: (previous: WebGLTexture, current: WebGLTexture, settings: ICompositeSettings) => void;
  dispose: () => void;
}

const COMPOSITE_UNIFORMS = ['previousFrame', 'currentFrame', 'weight', 'blurStrength', 'blurCenter'] as const;
const PREVIOUS_TEXTURE_UNIT = 0;
const CURRENT_TEXTURE_UNIT = 1;
const TRIANGLE_VERTEX_COUNT = 3;

export const createCompositePass = (gl: WebGL2RenderingContext): ICompositePass => {
  const program = createShaderProgram(
    gl,
    { vertex: FULLSCREEN_VERTEX_SHADER, fragment: COMPOSITE_FRAGMENT_SHADER },
    COMPOSITE_UNIFORMS,
  );
  const emptyVertexArray = gl.createVertexArray();

  const bindTexture = (unit: number, texture: WebGLTexture): void => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  };

  return {
    draw: (previous, current, { weight, blur, width, height }) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.useProgram(program.program);
      gl.bindVertexArray(emptyVertexArray);
      bindTexture(PREVIOUS_TEXTURE_UNIT, previous);
      bindTexture(CURRENT_TEXTURE_UNIT, current);
      gl.uniform1i(program.uniform('previousFrame'), PREVIOUS_TEXTURE_UNIT);
      gl.uniform1i(program.uniform('currentFrame'), CURRENT_TEXTURE_UNIT);
      gl.uniform1f(program.uniform('weight'), weight);
      gl.uniform1f(program.uniform('blurStrength'), blur?.strength ?? 0);
      gl.uniform2f(program.uniform('blurCenter'), blur?.center.x ?? 0.5, blur?.center.y ?? 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, TRIANGLE_VERTEX_COUNT);
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose: () => {
      gl.deleteProgram(program.program);
      gl.deleteVertexArray(emptyVertexArray);
    },
  };
};
