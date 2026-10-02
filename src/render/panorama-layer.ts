import { cropImage } from '../resources/image-decoder';
import { textureArrayByteSize } from '../resources/texture-memory';
import { type ITextureTile, planTextureSplit } from '../resources/texture-split-plan';
import { CUBE_FACES, EnumSourceType, type TSourceType } from '../tour/tour-dictionaries';
import { pixelsPerRadianForCube, pixelsPerRadianForEquirect } from '../view/view-limits';
import type { IEquirectDrawing, TLayerDrawing } from './layer-drawing';
import {
  type ITextureArray,
  createTextureArray,
  deleteTextureArray,
  generateTextureMipmaps,
  uploadTextureLayer,
} from './texture-array';

/**
 * Источник панорамы в видеопамяти: превью или основное изображение сцены. Изображения добавляются по мере
 * загрузки и освобождаются после копирования в текстуру.
 */
export interface IPanoramaLayer {
  addImage: (layerIndex: number, image: ImageBitmap) => Promise<void>;
  drawing: () => TLayerDrawing | null;
  isComplete: () => boolean;
  pixelsPerRadian: () => number | null;
  byteSize: () => number;
  dispose: () => void;
}

const ALL_FACES_MASK = (1 << CUBE_FACES.length) - 1;

const uploadTiles = async (
  gl: WebGL2RenderingContext,
  textureArray: ITextureArray,
  image: ImageBitmap,
  placements: readonly { tile: ITextureTile; layerIndex: number }[],
  isDisposed: () => boolean,
): Promise<void> => {
  if (placements.length === 1 && placements[0] !== undefined) {
    uploadTextureLayer(gl, textureArray, placements[0].layerIndex, image);

    return;
  }

  const crops = await Promise.all(placements.map(({ tile }) => cropImage(image, tile)));

  crops.forEach((crop, index) => {
    const placement = placements[index];

    if (!isDisposed() && placement !== undefined) {
      uploadTextureLayer(gl, textureArray, placement.layerIndex, crop);
    }

    crop.close();
  });
};

const createEquirectLayer = (gl: WebGL2RenderingContext, maxTextureSize: number): IPanoramaLayer => {
  let current: IEquirectDrawing | null = null;
  let isDisposed = false;

  const addImage = async (_layerIndex: number, image: ImageBitmap): Promise<void> => {
    const { width: imageWidth, height: imageHeight } = image;
    const plan = planTextureSplit(imageWidth, imageHeight, maxTextureSize);
    const textureArray = createTextureArray(gl, {
      layerWidth: plan.tileWidth,
      layerHeight: plan.tileHeight,
      layerCount: plan.tiles.length,
      isHorizontallyRepeated: plan.columns === 1,
      isMipmapped: true,
    });
    const placements = plan.tiles.map((tile, layerIndex) => ({ tile, layerIndex }));

    await uploadTiles(gl, textureArray, image, placements, () => isDisposed);
    image.close();

    if (isDisposed) {
      deleteTextureArray(gl, textureArray);

      return;
    }

    generateTextureMipmaps(gl, textureArray);
    current = {
      type: EnumSourceType.Equirect,
      textureArray,
      imageWidth,
      imageHeight,
      columns: plan.columns,
      rows: plan.rows,
    };
  };

  return {
    addImage,
    drawing: () => current,
    isComplete: () => current !== null,
    pixelsPerRadian: () => (current === null ? null : pixelsPerRadianForEquirect(current.imageWidth)),
    byteSize: () => (current === null ? 0 : textureArrayByteSize(current.textureArray)),
    dispose: () => {
      isDisposed = true;

      if (current !== null) {
        deleteTextureArray(gl, current.textureArray);
      }
    },
  };
};

const createCubeLayer = (gl: WebGL2RenderingContext, maxTextureSize: number): IPanoramaLayer => {
  let textureArray: ITextureArray | null = null;
  let faceSize = 0;
  let tilesPerSide = 1;
  let readyFaces = 0;
  let isDisposed = false;

  const ensureTextureArray = (size: number): ITextureArray => {
    if (textureArray !== null) {
      return textureArray;
    }

    const plan = planTextureSplit(size, size, maxTextureSize);

    faceSize = size;
    tilesPerSide = plan.columns;
    textureArray = createTextureArray(gl, {
      layerWidth: plan.tileWidth,
      layerHeight: plan.tileHeight,
      layerCount: CUBE_FACES.length * plan.tiles.length,
      isHorizontallyRepeated: false,
      isMipmapped: true,
    });

    return textureArray;
  };

  const addImage = async (faceIndex: number, image: ImageBitmap): Promise<void> => {
    const target = ensureTextureArray(image.width);
    const plan = planTextureSplit(faceSize, faceSize, maxTextureSize);
    const placements = plan.tiles.map((tile) => ({
      tile,
      layerIndex: faceIndex * plan.tiles.length + tile.row * plan.columns + tile.column,
    }));

    await uploadTiles(gl, target, image, placements, () => isDisposed);
    image.close();

    if (!isDisposed) {
      generateTextureMipmaps(gl, target);
      readyFaces |= 1 << faceIndex;
    }
  };

  return {
    addImage,
    drawing: () =>
      textureArray === null || readyFaces === 0
        ? null
        : { type: EnumSourceType.Cube, textureArray, faceSize, tilesPerSide, readyFaces },
    isComplete: () => readyFaces === ALL_FACES_MASK,
    pixelsPerRadian: () => (readyFaces === 0 ? null : pixelsPerRadianForCube(faceSize)),
    byteSize: () => (textureArray === null ? 0 : textureArrayByteSize(textureArray)),
    dispose: () => {
      isDisposed = true;

      if (textureArray !== null) {
        deleteTextureArray(gl, textureArray);
      }
    },
  };
};

/**
 * Слой нужного типа. `maxTextureSize` — лимит устройства: всё, что больше, режется на тайлы-слои.
 */
export const createPanoramaLayer = (
  gl: WebGL2RenderingContext,
  type: TSourceType,
  maxTextureSize: number,
): IPanoramaLayer =>
  type === EnumSourceType.Cube
    ? createCubeLayer(gl, maxTextureSize)
    : createEquirectLayer(gl, maxTextureSize);
