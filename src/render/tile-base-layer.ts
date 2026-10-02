import { textureArrayByteSize } from '../resources/texture-memory';
import type { ITileAddress, ITileLevel } from '../tour/tile-pyramid';
import { CUBE_FACES } from '../tour/tour-dictionaries';
import {
  type ITextureArray,
  createTextureArray,
  deleteTextureArray,
  generateTextureMipmaps,
  uploadTextureRegion,
} from './texture-array';

/**
 * Подложка тайлового куба в видеопамяти: слой на грань размером с самый мелкий уровень, с MIP — она видна и
 * при очень широком FOV. Тайлы записываются в грань со сдвигом; грань рисуется, когда собрана целиком.
 */
export interface ITileBaseLayer {
  textureArray: ITextureArray;
  faceSize: number;
  addTile: (address: ITileAddress, image: ImageBitmap) => void;
  readyFaces: () => number;
  isComplete: () => boolean;
  byteSize: () => number;
  dispose: () => void;
}

const ALL_FACES_MASK = (1 << CUBE_FACES.length) - 1;

/**
 * MIP пересчитываются, когда собрана очередная грань: `generateMipmap` строит их для всего массива, а
 * подложка маленькая — шесть пересчётов дешевле, чем ждать все грани.
 */
export const createTileBaseLayer = (gl: WebGL2RenderingContext, level: ITileLevel): ITileBaseLayer => {
  const textureArray = createTextureArray(gl, {
    layerWidth: level.faceSize,
    layerHeight: level.faceSize,
    layerCount: CUBE_FACES.length,
    isHorizontallyRepeated: false,
    isMipmapped: true,
  });
  const tilesPerFace = level.tilesPerSide * level.tilesPerSide;
  const uploadedTiles = CUBE_FACES.map(() => new Set<number>());
  let readyFaces = 0;

  const addTile = (address: ITileAddress, image: ImageBitmap): void => {
    const offset = { x: address.column * level.tileSize, y: address.row * level.tileSize };
    const faceTiles = uploadedTiles[address.face];

    if (faceTiles === undefined) {
      return;
    }

    uploadTextureRegion(gl, textureArray, address.face, offset, image);
    faceTiles.add(address.row * level.tilesPerSide + address.column);

    if (faceTiles.size === tilesPerFace && (readyFaces & (1 << address.face)) === 0) {
      generateTextureMipmaps(gl, textureArray);
      readyFaces |= 1 << address.face;
    }
  };

  return {
    textureArray,
    faceSize: level.faceSize,
    addTile,
    readyFaces: () => readyFaces,
    isComplete: () => readyFaces === ALL_FACES_MASK,
    byteSize: () => textureArrayByteSize(textureArray),
    dispose: () => {
      deleteTextureArray(gl, textureArray);
    },
  };
};
