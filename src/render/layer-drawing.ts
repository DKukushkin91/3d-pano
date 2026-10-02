import type { EnumSourceType } from '../tour/tour-dictionaries';
import type { ITextureArray } from './texture-array';
import type { ITiledLevelUniforms } from './tile-table';

/**
 * Что нужно отрисовщику, чтобы нарисовать эквиректангулярный слой: текстура тайлов, размер исходного
 * изображения и сетка тайлов.
 */
export interface IEquirectDrawing {
  type: typeof EnumSourceType.Equirect;
  textureArray: ITextureArray;
  imageWidth: number;
  imageHeight: number;
  columns: number;
  rows: number;
}

/**
 * Кубический слой: размер грани, число тайлов на сторону грани и маска загруженных граней.
 */
export interface ICubeDrawing {
  type: typeof EnumSourceType.Cube;
  textureArray: ITextureArray;
  faceSize: number;
  tilesPerSide: number;
  readyFaces: number;
}

/**
 * Вид отрисовки тайлового куба: источник тот же `cube`, но рисует его своя программа.
 */
export const TILED_CUBE_DRAWING = 'tiled-cube';

/**
 * Тайловый куб: подложка (слой на грань, с MIP) и маска её готовых граней, пул тайлов (`null` — пул пуст),
 * таблица сопоставления сцены и данные уровней для шейдера.
 */
export interface ITiledCubeDrawing {
  type: typeof TILED_CUBE_DRAWING;
  base: ITextureArray;
  baseFaceSize: number;
  readyFaces: number;
  pool: ITextureArray | null;
  table: { texture: WebGLTexture; width: number };
  levels: ITiledLevelUniforms;
}

export type TLayerDrawing = IEquirectDrawing | ICubeDrawing | ITiledCubeDrawing;
