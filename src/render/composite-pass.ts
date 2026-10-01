import { createShaderProgram } from './shader-program';
import { COMPOSITE_FRAGMENT_SHADER } from './shaders/composite-fragment';
import { FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen-vertex';

/**
 * Проход смешивания: рисует в canvas два кадра-текстуры с весом текущего.
 */
export interface ICompositePass {
  draw: (
    previous: WebGLTexture,
    current: WebGLTexture,
    weight: number,
    bufferWidth: number,
    bufferHeight: number,
  ) => void;
  dispose: () => void;
}

const COMPOSITE_UNIFORMS = ['previousFrame', 'currentFrame', 'weight'] as const;
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
    draw: (previous, current, weight, bufferWidth, bufferHeight) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, bufferWidth, bufferHeight);
      gl.useProgram(program.program);
      gl.bindVertexArray(emptyVertexArray);
      bindTexture(PREVIOUS_TEXTURE_UNIT, previous);
      bindTexture(CURRENT_TEXTURE_UNIT, current);
      gl.uniform1i(program.uniform('previousFrame'), PREVIOUS_TEXTURE_UNIT);
      gl.uniform1i(program.uniform('currentFrame'), CURRENT_TEXTURE_UNIT);
      gl.uniform1f(program.uniform('weight'), weight);
      gl.drawArrays(gl.TRIANGLES, 0, TRIANGLE_VERTEX_COUNT);
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose: () => {
      gl.deleteProgram(program.program);
      gl.deleteVertexArray(emptyVertexArray);
    },
  };
};
