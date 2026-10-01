import { EnumErrorCode } from '../state/viewer-dictionaries';
import { PanoLoadError, createPanoError, isAbortError } from './load-errors';

const toNetworkError = (error: unknown, url: string): unknown =>
  isAbortError(error)
    ? error
    : new PanoLoadError(
        createPanoError(EnumErrorCode.NetworkFailed, {
          message: `Network request failed for ${url}`,
          url,
          cause: error,
        }),
      );

/**
 * Загрузка по умолчанию: CORS без учётных данных на чужие домены — так же, как `<img crossorigin="anonymous">`,
 * поэтому кэш браузера и прокси с `Access-Control-Allow-Origin` работают одинаково для страницы и
 * просмотрщика.
 */
export const fetchImageBlob = async (url: string, signal: AbortSignal): Promise<Blob> => {
  const response = await fetch(url, { mode: 'cors', credentials: 'same-origin', signal }).catch(
    (error: unknown) => {
      throw toNetworkError(error, url);
    },
  );

  if (!response.ok) {
    throw new PanoLoadError(
      createPanoError(EnumErrorCode.HttpStatus, {
        message: `Server responded with ${String(response.status)} for ${url}`,
        url,
        httpStatus: response.status,
      }),
    );
  }

  return response.blob().catch((error: unknown) => {
    throw toNetworkError(error, url);
  });
};
