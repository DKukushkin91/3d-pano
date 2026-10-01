import type { EnumSourceType } from '../tour/tour-dictionaries';
import type { ITextureArray } from './texture-array';

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

export type TLayerDrawing = IEquirectDrawing | ICubeDrawing;
