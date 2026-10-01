import type { ICameraBasis } from '../math/camera-basis';
import type { IHalfTangents } from '../math/field-of-view';
import { EnumSourceType } from '../tour/tour-dictionaries';
import type { IGlContext } from './gl-context';
import type { ICubeDrawing, IEquirectDrawing, TLayerDrawing } from './layer-drawing';
import { type IShaderProgram, createShaderProgram } from './shader-program';
import { CUBE_FRAGMENT_SHADER } from './shaders/cube-fragment';
import { EQUIRECT_FRAGMENT_SHADER } from './shaders/equirect-fragment';
import { FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen-vertex';

/**
 * Камера кадра: оси камеры в мире и тангенсы половин углов обзора.
 */
export interface IFrameCamera {
  basis: ICameraBasis;
  halfTangents: IHalfTangents;
}

export interface IRenderer {
  drawFrame: (
    camera: IFrameCamera,
    drawings: readonly TLayerDrawing[],
    bufferWidth: number,
    bufferHeight: number,
  ) => void;
  dispose: () => void;
}

const CAMERA_UNIFORMS = ['cameraToWorld', 'halfTangents', 'tiles'] as const;
const EQUIRECT_UNIFORMS = [...CAMERA_UNIFORMS, 'imageSize', 'tileSize', 'tileGrid'] as const;
const CUBE_UNIFORMS = [...CAMERA_UNIFORMS, 'faceSize', 'tilesPerSide', 'readyFaces'] as const;
const TRIANGLE_VERTEX_COUNT = 3;
const TEXTURE_UNIT = 0;

type TCameraUniform = (typeof CAMERA_UNIFORMS)[number];

const writeCameraMatrix = (target: Float32Array, basis: ICameraBasis): Float32Array => {
  target.set([
    basis.right.x,
    basis.right.y,
    basis.right.z,
    basis.up.x,
    basis.up.y,
    basis.up.z,
    basis.forward.x,
    basis.forward.y,
    basis.forward.z,
  ]);

  return target;
};

/**
 * Отрисовщик: две программы (эквиректангулярная и кубическая), один полноэкранный проход на слой. Слои
 * рисуются по порядку — превью, затем основной источник поверх.
 */
export const createRenderer = ({ gl }: IGlContext): IRenderer => {
  const equirectProgram = createShaderProgram(
    gl,
    { vertex: FULLSCREEN_VERTEX_SHADER, fragment: EQUIRECT_FRAGMENT_SHADER },
    EQUIRECT_UNIFORMS,
  );
  const cubeProgram = createShaderProgram(
    gl,
    { vertex: FULLSCREEN_VERTEX_SHADER, fragment: CUBE_FRAGMENT_SHADER },
    CUBE_UNIFORMS,
  );
  const emptyVertexArray = gl.createVertexArray();
  const cameraMatrix = new Float32Array(9);

  const applyCamera = <TUniform extends string>(
    program: IShaderProgram<TUniform | TCameraUniform>,
    camera: IFrameCamera,
  ): void => {
    gl.useProgram(program.program);
    gl.uniformMatrix3fv(
      program.uniform('cameraToWorld'),
      false,
      writeCameraMatrix(cameraMatrix, camera.basis),
    );
    gl.uniform2f(program.uniform('halfTangents'), camera.halfTangents.width, camera.halfTangents.height);
    gl.uniform1i(program.uniform('tiles'), TEXTURE_UNIT);
  };

  const drawEquirect = (drawing: IEquirectDrawing, camera: IFrameCamera): void => {
    applyCamera(equirectProgram, camera);
    gl.uniform2f(equirectProgram.uniform('imageSize'), drawing.imageWidth, drawing.imageHeight);
    gl.uniform2f(
      equirectProgram.uniform('tileSize'),
      drawing.textureArray.layerWidth,
      drawing.textureArray.layerHeight,
    );
    gl.uniform2f(equirectProgram.uniform('tileGrid'), drawing.columns, drawing.rows);
  };

  const drawCube = (drawing: ICubeDrawing, camera: IFrameCamera): void => {
    applyCamera(cubeProgram, camera);
    gl.uniform1f(cubeProgram.uniform('faceSize'), drawing.faceSize);
    gl.uniform1f(cubeProgram.uniform('tilesPerSide'), drawing.tilesPerSide);
    gl.uniform1ui(cubeProgram.uniform('readyFaces'), drawing.readyFaces);
  };

  const drawFrame: IRenderer['drawFrame'] = (camera, drawings, bufferWidth, bufferHeight) => {
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(emptyVertexArray);
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_UNIT);

    for (const drawing of drawings) {
      if (drawing.type === EnumSourceType.Cube) {
        drawCube(drawing, camera);
      } else {
        drawEquirect(drawing, camera);
      }

      gl.bindTexture(gl.TEXTURE_2D_ARRAY, drawing.textureArray.texture);
      gl.drawArrays(gl.TRIANGLES, 0, TRIANGLE_VERTEX_COUNT);
    }
  };

  const dispose = (): void => {
    gl.deleteProgram(equirectProgram.program);
    gl.deleteProgram(cubeProgram.program);
    gl.deleteVertexArray(emptyVertexArray);
  };

  return { drawFrame, dispose };
};
