import { type ITilePlacement, type ITileSlots, createTileSlots } from '../tiles/tile-pool-plan';
import {
  type ITextureArray,
  createTextureArray,
  deleteTextureArray,
  uploadTextureLayer,
} from './texture-array';

/**
 * Пул тайлов просмотрщика в видеопамяти: одна текстура-массив без MIP, слой на тайл. `textureArray` —
 * `null` при нулевой ёмкости: тогда рисуются только подложки.
 */
export interface ITilePool {
  tileSize: number;
  textureArray: ITextureArray | null;
  slots: ITileSlots;
  upload: (
    url: string,
    image: ImageBitmap,
    protectedUrls: ReadonlySet<string>,
    frameNumber: number,
  ) => ITilePlacement | null;
  dispose: () => void;
}

/**
 * Выделяет пул целиком сразу: ёмкость уже посчитана по бюджету и лимиту слоёв. Тайл меньше `tileSize`
 * (уровень одним тайлом) занимает левый верхний угол слоя — шейдер масштабирует координаты.
 */
export const createTilePool = (gl: WebGL2RenderingContext, tileSize: number, capacity: number): ITilePool => {
  const slots = createTileSlots(capacity);
  const textureArray =
    capacity === 0
      ? null
      : createTextureArray(gl, {
          layerWidth: tileSize,
          layerHeight: tileSize,
          layerCount: capacity,
          isHorizontallyRepeated: false,
          isMipmapped: false,
        });

  return {
    tileSize,
    textureArray,
    slots,
    upload: (url, image, protectedUrls, frameNumber) => {
      if (textureArray === null) {
        return null;
      }

      const placement = slots.place(url, protectedUrls, frameNumber);

      if (placement !== null) {
        uploadTextureLayer(gl, textureArray, placement.slot, image);
      }

      return placement;
    },
    dispose: () => {
      if (textureArray !== null) {
        deleteTextureArray(gl, textureArray);
      }
    },
  };
};
