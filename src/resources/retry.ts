import { isAbortError, isRetryableError } from './load-errors';

/**
 * Политика повтора загрузки изображений: `attempts` — сколько раз повторить после первой неудачи (0 —
 * без повторов), `delayMs` — задержка перед первым повтором; каждая следующая втрое больше.
 */
export interface IRetryOptions {
  attempts?: number;
  delayMs?: number;
}

export interface IResolvedRetryOptions {
  attempts: number;
  delayMs: number;
}

export const DEFAULT_RETRY_OPTIONS: Readonly<IResolvedRetryOptions> = { attempts: 2, delayMs: 500 };

export const RETRY_DELAY_GROWTH = 3;

export type TWait = (durationMs: number, signal: AbortSignal) => Promise<void>;

/**
 * Задержка перед повтором номер `retryIndex` (с нуля): 500, 1500, 4500 мс при умолчаниях.
 */
export const retryDelayMs = (retryIndex: number, options: IResolvedRetryOptions): number =>
  options.delayMs * RETRY_DELAY_GROWTH ** retryIndex;

const createAbortError = (): Error => {
  const error = new Error('The operation was aborted');

  error.name = 'AbortError';

  return error;
};

/**
 * Ожидание, которое прерывается сигналом отмены — уничтожение просмотрщика не ждёт таймеров повтора.
 */
export const waitWithSignal: TWait = (durationMs, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());

      return;
    }

    const handleAbort = (): void => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, durationMs);

    signal.addEventListener('abort', handleAbort, { once: true });
  });

interface IRetrySettings {
  retry: IResolvedRetryOptions;
  signal: AbortSignal;
  wait?: TWait;
}

const attempt = async <TResult>(
  operation: () => Promise<TResult>,
  settings: IRetrySettings,
  retryIndex: number,
): Promise<TResult> => {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || !isRetryableError(error) || retryIndex >= settings.retry.attempts) {
      throw error;
    }

    await (settings.wait ?? waitWithSignal)(retryDelayMs(retryIndex, settings.retry), settings.signal);

    return attempt(operation, settings, retryIndex + 1);
  }
};

/**
 * Выполняет операцию с повторами по политике. Отмена и неповторяемые ошибки пробрасываются сразу.
 * `wait` подменяется в контракт-тестах, чтобы не ждать реальные секунды.
 */
export const withRetry = <TResult>(
  operation: () => Promise<TResult>,
  settings: IRetrySettings,
): Promise<TResult> => attempt(operation, settings, 0);
