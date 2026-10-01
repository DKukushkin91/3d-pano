import { ERROR_CATEGORY_BY_CODE, EnumErrorCode, type TErrorCode } from '../state/viewer-dictionaries';
import type { IPanoError } from '../state/viewer-state-types';

const FIRST_SERVER_ERROR_STATUS = 500;

/**
 * Ошибка просмотрщика собирается по коду: категория берётся из таблицы, поэтому код и категория не могут
 * разойтись.
 */
export const createPanoError = (
  code: TErrorCode,
  fields: Omit<IPanoError, 'category' | 'code'>,
): IPanoError => ({
  category: ERROR_CATEGORY_BY_CODE[code],
  code,
  ...fields,
});

/**
 * Исключение, которым конвейер загрузки передаёт готовое описание ошибки через промисы.
 */
export class PanoLoadError extends Error {
  readonly details: IPanoError;

  constructor(details: IPanoError) {
    super(details.message, { cause: details.cause });
    this.name = 'PanoLoadError';
    this.details = details;
  }
}

/**
 * Отмена — не ошибка: её не повторяют и о ней не сообщают хосту.
 */
export const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

/**
 * Повторяются сбои, которые могут пройти сами: сеть, ответы 5xx и отказы загрузчика хоста (его природа
 * неизвестна). Ответы 4xx, битые и неподходящие изображения при повторе не исправятся.
 */
export const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof PanoLoadError)) {
    return false;
  }

  const { code, httpStatus } = error.details;

  if (code === EnumErrorCode.HttpStatus) {
    return httpStatus !== undefined && httpStatus >= FIRST_SERVER_ERROR_STATUS;
  }

  return code === EnumErrorCode.NetworkFailed || code === EnumErrorCode.LoaderFailed;
};

/**
 * Любое исключение конвейера, кроме отмены, превращается в описание ошибки; непредвиденное считается
 * сбоем сети. `subject` — что загружалось, для текста сообщения (например, `scene "room"`).
 */
export const toPanoError = (error: unknown, subject: string): IPanoError =>
  error instanceof PanoLoadError
    ? error.details
    : createPanoError(EnumErrorCode.NetworkFailed, { message: `Failed to load ${subject}`, cause: error });
