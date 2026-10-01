import type { TImageLoader } from '@dkukushkin/3d-pano';

/**
 * Переключатели загрузчика песочницы: медленная сеть и «пропавшая» грань — для сценариев превью, ошибки
 * загрузки и кнопки «Повторить».
 */
export interface IPlaygroundNetwork {
  isSlow: boolean;
  failingSuffix: string | null;
}

const SLOW_NETWORK_DELAY_MS = 2000;

const delay = (durationMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, durationMs);

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

/**
 * Загрузчик хоста поверх `fetch`: задерживает основные изображения (не превью) и может отказать на
 * выбранном файле — так видно, как превью остаётся на экране, а ошибка приходит с категорией `resource`.
 */
export const createPlaygroundLoader =
  (network: IPlaygroundNetwork): TImageLoader =>
  async ({ url, signal }) => {
    if (network.isSlow && !url.includes('-preview')) {
      await delay(SLOW_NETWORK_DELAY_MS, signal);
    }

    if (network.failingSuffix !== null && url.endsWith(network.failingSuffix)) {
      throw new Error(`playground: ${url} is switched off`);
    }

    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`playground: HTTP ${String(response.status)} for ${url}`);
    }

    return response.blob();
  };
