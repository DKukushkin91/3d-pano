import type { IPreloadSceneOptions, TPanoViewerUpdate } from '@dkukushkin/3d-pano';

/**
 * Поля панели тайлов песочницы: бюджет пула, проявление, предзагрузка для текущего вида и счётчик запросов.
 */
export interface ITileControlElements {
  cacheBudget: HTMLSelectElement;
  fade: HTMLInputElement;
  preloadKeep: HTMLInputElement;
  requests: HTMLOutputElement;
  resetRequests: HTMLButtonElement;
}

/**
 * `options` — тайловые опции для нового просмотрщика, `preloadOptions` — опции `preloadScene` по флажку,
 * `countRequest` получает каждый запрос загрузчика и считает только тайлы.
 */
export interface ITileControls {
  options: () => TPanoViewerUpdate;
  preloadOptions: () => IPreloadSceneOptions;
  countRequest: (url: string) => void;
}

const TILE_URL_PART = '/tiles/';

/**
 * Панель тайлов: изменения бюджета и проявления сразу уходят в `update()` просмотрщика.
 */
export const createTileControls = (
  elements: ITileControlElements,
  onUpdate: (update: TPanoViewerUpdate) => void,
): ITileControls => {
  let requestCount = 0;

  const options = (): TPanoViewerUpdate => ({
    tileCacheMegabytes: Number(elements.cacheBudget.value),
    tileFadeMs: Number(elements.fade.value),
  });

  const showCount = (): void => {
    elements.requests.value = String(requestCount);
  };

  elements.cacheBudget.addEventListener('change', () => {
    onUpdate(options());
  });
  elements.fade.addEventListener('change', () => {
    onUpdate(options());
  });
  elements.resetRequests.addEventListener('click', () => {
    requestCount = 0;
    showCount();
  });

  return {
    options,
    preloadOptions: () => (elements.preloadKeep.checked ? { view: 'keep' } : {}),
    countRequest: (url) => {
      if (url.includes(TILE_URL_PART)) {
        requestCount += 1;
        showCount();
      }
    },
  };
};
