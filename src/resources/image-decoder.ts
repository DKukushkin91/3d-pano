import { EnumErrorCode } from '../state/viewer-dictionaries';
import { PanoLoadError, createPanoError } from './load-errors';
import type { ITextureTile } from './texture-split-plan';

/**
 * Декодирование через `createImageBitmap` идёт вне основного потока там, где браузер это умеет, и не
 * блокирует вращение панорамы, пока грузятся большие изображения.
 */
export const decodeImage = async (
  data: Blob | ImageBitmap,
  url: string,
  options?: ImageBitmapOptions,
): Promise<ImageBitmap> => {
  if (!(data instanceof Blob)) {
    return data;
  }

  try {
    return await createImageBitmap(data, options);
  } catch (error) {
    throw new PanoLoadError(
      createPanoError(EnumErrorCode.DecodeFailed, {
        message: `Could not decode the image ${url}`,
        url,
        cause: error,
      }),
    );
  }
};

/**
 * Вырезает тайл из декодированного изображения для слоя текстуры-массива.
 */
export const cropImage = (image: ImageBitmap, tile: ITextureTile): Promise<ImageBitmap> =>
  createImageBitmap(image, tile.x, tile.y, tile.width, tile.height);
