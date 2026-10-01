import { EnumErrorCode } from '../state/viewer-dictionaries';
import { fetchImageBlob } from './default-loader';
import { decodeImage } from './image-decoder';
import { PanoLoadError, createPanoError, isAbortError } from './load-errors';
import { type IResolvedRetryOptions, type TWait, withRetry } from './retry';

/**
 * Загрузчик хоста: получает URL и сигнал отмены, возвращает `Blob` или готовый `ImageBitmap`. Через него
 * добавляют авторизацию, прокси, подписанные URL или собственный кэш.
 */
export type TImageLoader = (request: { url: string; signal: AbortSignal }) => Promise<Blob | ImageBitmap>;

export interface IImageLoadSettings {
  loader: TImageLoader | null;
  retry: IResolvedRetryOptions;
  signal: AbortSignal;
  wait?: TWait;
}

const isImageData = (value: unknown): value is Blob | ImageBitmap =>
  value instanceof Blob || (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap);

const loaderFailure = (url: string, message: string, cause?: unknown): PanoLoadError =>
  new PanoLoadError(createPanoError(EnumErrorCode.LoaderFailed, { message, url, cause }));

const requestFromHost = async (
  loader: TImageLoader,
  url: string,
  signal: AbortSignal,
): Promise<Blob | ImageBitmap> => {
  const result: unknown = await Promise.resolve()
    .then(() => loader({ url, signal }))
    .catch((error: unknown) => {
      throw isAbortError(error) || signal.aborted
        ? error
        : loaderFailure(url, `The host loader failed for ${url}`, error);
    });

  if (!isImageData(result)) {
    throw loaderFailure(url, `The host loader must resolve to a Blob or an ImageBitmap for ${url}`);
  }

  return result;
};

/**
 * Одно изображение: загрузчик хоста или `fetch`, затем декодирование, всё — с повтором по политике.
 */
export const loadImage = (url: string, settings: IImageLoadSettings): Promise<ImageBitmap> =>
  withRetry(
    async () => {
      const data =
        settings.loader === null
          ? await fetchImageBlob(url, settings.signal)
          : await requestFromHost(settings.loader, url, settings.signal);

      return decodeImage(data, url);
    },
    { retry: settings.retry, signal: settings.signal, wait: settings.wait },
  );
