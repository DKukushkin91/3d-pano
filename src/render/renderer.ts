import type { ICameraBasis } from '../math/camera-basis';
import type { IHalfTangents } from '../math/field-of-view';
import { type ISceneSpace, ZERO_OFFSET } from '../math/scene-space';
import { EnumSourceType } from '../tour/tour-dictionaries';
import type { IGlContext } from './gl-context';
import {
  type ICubeDrawing,
  type IEquirectDrawing,
  type ITiledCubeDrawing,
  TILED_CUBE_DRAWING,
  type TLayerDrawing,
} from './layer-drawing';
import { type IShaderProgram, createShaderProgram } from './shader-program';
import { CUBE_FRAGMENT_SHADER } from './shaders/cube-fragment';
import { EQUIRECT_FRAGMENT_SHADER } from './shaders/equirect-fragment';
import { FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen-vertex';
import { TILED_CUBE_FRAGMENT_SHADER } from './shaders/tiled-cube-fragment';

/**
 * Камера кадра: оси камеры в мире, тангенсы половин углов обзора и пространство сцены — сдвиг камеры от
 * центра и модель «пол + сфера». Без `space` камера в центре сцены.
 */
export interface IFrameCamera {
  basis: ICameraBasis;
  halfTangents: IHalfTangents;
  space?: ISceneSpace;
}

/**
 * `target` — framebuffer текстуры кадра во время смешивания, `null` — сам canvas.
 */
export interface IRenderer {
  drawFrame: (
    camera: IFrameCamera,
    drawings: readonly TLayerDrawing[],
    bufferWidth: number,
    bufferHeight: number,
    target: WebGLFramebuffer | null,
  ) => void;
  dispose: () => void;
}

const CAMERA_UNIFORMS = [
  'cameraToWorld',
  'halfTangents',
  'cameraOffset',
  'floorDepth',
  'modelRadius',
] as const;
const EQUIRECT_UNIFORMS = [...CAMERA_UNIFORMS, 'tiles', 'imageSize', 'tileSize', 'tileGrid'] as const;
const CUBE_UNIFORMS = [...CAMERA_UNIFORMS, 'tiles', 'faceSize', 'tilesPerSide', 'readyFaces'] as const;
const TILED_CUBE_UNIFORMS = [
  ...CAMERA_UNIFORMS,
  'baseTiles',
  'baseFaceSize',
  'readyFaces',
  'poolTiles',
  'tileTable',
  'tableWidth',
  'levelCount',
  'levelFaceSizes',
  'levelTilesPerSide',
  'levelOffsets',
  'levelTileScales',
] as const;
const TRIANGLE_VERTEX_COUNT = 3;
const TEXTURE_UNIT = 0;
const POOL_TEXTURE_UNIT = 1;
const TABLE_TEXTURE_UNIT = 2;

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
 * Отрисовщик: три программы (эквиректангулярная, кубическая и тайлового куба), один полноэкранный проход
 * на слой. Слои рисуются по порядку — превью, затем основной источник поверх.
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
  const tiledCubeProgram = createShaderProgram(
    gl,
    { vertex: FULLSCREEN_VERTEX_SHADER, fragment: TILED_CUBE_FRAGMENT_SHADER },
    TILED_CUBE_UNIFORMS,
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

    const offset = camera.space?.offset ?? ZERO_OFFSET;
    const model = camera.space?.model;

    gl.uniform3f(program.uniform('cameraOffset'), offset.x, offset.y, offset.z);
    gl.uniform1f(program.uniform('floorDepth'), model?.floorDepth ?? 0);
    gl.uniform1f(program.uniform('modelRadius'), model?.radius ?? 1);
  };

  const bindTexture = (unit: number, target: number, texture: WebGLTexture): void => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, texture);
  };

  const drawEquirect = (drawing: IEquirectDrawing, camera: IFrameCamera): void => {
    applyCamera(equirectProgram, camera);
    gl.uniform1i(equirectProgram.uniform('tiles'), TEXTURE_UNIT);
    gl.uniform2f(equirectProgram.uniform('imageSize'), drawing.imageWidth, drawing.imageHeight);
    gl.uniform2f(
      equirectProgram.uniform('tileSize'),
      drawing.textureArray.layerWidth,
      drawing.textureArray.layerHeight,
    );
    gl.uniform2f(equirectProgram.uniform('tileGrid'), drawing.columns, drawing.rows);
    bindTexture(TEXTURE_UNIT, gl.TEXTURE_2D_ARRAY, drawing.textureArray.texture);
  };

  const drawCube = (drawing: ICubeDrawing, camera: IFrameCamera): void => {
    applyCamera(cubeProgram, camera);
    gl.uniform1i(cubeProgram.uniform('tiles'), TEXTURE_UNIT);
    gl.uniform1f(cubeProgram.uniform('faceSize'), drawing.faceSize);
    gl.uniform1f(cubeProgram.uniform('tilesPerSide'), drawing.tilesPerSide);
    gl.uniform1ui(cubeProgram.uniform('readyFaces'), drawing.readyFaces);
    bindTexture(TEXTURE_UNIT, gl.TEXTURE_2D_ARRAY, drawing.textureArray.texture);
  };

  const drawTiledCube = (drawing: ITiledCubeDrawing, camera: IFrameCamera): void => {
    const program = tiledCubeProgram;
    const { levels } = drawing;

    applyCamera(program, camera);
    gl.uniform1i(program.uniform('baseTiles'), TEXTURE_UNIT);
    gl.uniform1f(program.uniform('baseFaceSize'), drawing.baseFaceSize);
    gl.uniform1ui(program.uniform('readyFaces'), drawing.readyFaces);
    gl.uniform1i(program.uniform('poolTiles'), POOL_TEXTURE_UNIT);
    gl.uniform1i(program.uniform('tileTable'), TABLE_TEXTURE_UNIT);
    gl.uniform1i(program.uniform('tableWidth'), drawing.table.width);
    gl.uniform1i(program.uniform('levelCount'), levels.count);
    gl.uniform1fv(program.uniform('levelFaceSizes'), levels.faceSizes);
    gl.uniform1fv(program.uniform('levelTilesPerSide'), levels.tilesPerSide);
    gl.uniform1iv(program.uniform('levelOffsets'), levels.offsets);
    gl.uniform1fv(program.uniform('levelTileScales'), levels.tileScales);
    bindTexture(TABLE_TEXTURE_UNIT, gl.TEXTURE_2D, drawing.table.texture);
    bindTexture(POOL_TEXTURE_UNIT, gl.TEXTURE_2D_ARRAY, (drawing.pool ?? drawing.base).texture);
    bindTexture(TEXTURE_UNIT, gl.TEXTURE_2D_ARRAY, drawing.base.texture);
  };

  const drawLayer = (drawing: TLayerDrawing, camera: IFrameCamera): void => {
    if (drawing.type === TILED_CUBE_DRAWING) {
      drawTiledCube(drawing, camera);
    } else if (drawing.type === EnumSourceType.Cube) {
      drawCube(drawing, camera);
    } else {
      drawEquirect(drawing, camera);
    }
  };

  const drawFrame: IRenderer['drawFrame'] = (camera, drawings, bufferWidth, bufferHeight, target) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, bufferWidth, bufferHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(emptyVertexArray);

    for (const drawing of drawings) {
      drawLayer(drawing, camera);
      gl.drawArrays(gl.TRIANGLES, 0, TRIANGLE_VERTEX_COUNT);
    }
  };

  const dispose = (): void => {
    gl.deleteProgram(equirectProgram.program);
    gl.deleteProgram(cubeProgram.program);
    gl.deleteProgram(tiledCubeProgram.program);
    gl.deleteVertexArray(emptyVertexArray);
  };

  return { drawFrame, dispose };
};
