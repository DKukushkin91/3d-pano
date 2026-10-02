import { isAbortError } from '../resources/load-errors';

/**
 * Одновременных запросов тайлов на просмотрщик. Больше, чем браузер держит соединений к хосту по HTTP/1.1,
 * зато на HTTP/2 и CDN кадр становится чётким быстрее (решение владельца).
 */
export const TILE_REQUEST_CONCURRENCY = 8;

/**
 * Нужный тайл: URL, уровень и угол от центра кадра. Тайлы предзагрузки ждут, пока не запрошены все тайлы
 * сцен на экране.
 */
export interface ITileWant {
  url: string;
  level: number;
  distance: number;
  isPreload: boolean;
}

export interface ITileQueueOptions<TImage> {
  concurrency: number;
  load: (url: string, signal: AbortSignal) => Promise<TImage>;
  discard: (image: TImage) => void;
  onLoaded: (url: string, image: TImage) => void;
  onFailed: (url: string, error: unknown) => void;
}

/**
 * Очередь тайлов просмотрщика. Каждый владелец (сессия сцены, предзагрузка) целиком заменяет свой список
 * нужных тайлов вызовом `want`; запрос, который больше никому не нужен, отменяется. Тайл, загрузка
 * которого не удалась, не запрашивается, пока он кому-то нужен, — он ждёт, когда уйдёт из всех списков,
 * или `forgetFailures` (это `retry()`).
 */
export interface ITileQueue {
  want: (owner: object, wants: readonly ITileWant[]) => void;
  forgetFailures: (urls: readonly string[]) => void;
  isFailed: (url: string) => boolean;
  dispose: () => void;
}

const byPriority = (first: ITileWant, second: ITileWant): number =>
  Number(first.isPreload) - Number(second.isPreload) ||
  first.level - second.level ||
  first.distance - second.distance;

const isBetter = (candidate: ITileWant, known: ITileWant | undefined): boolean =>
  known === undefined || byPriority(candidate, known) < 0;

export const createTileQueue = <TImage>(options: ITileQueueOptions<TImage>): ITileQueue => {
  const ownerWants = new Map<object, Map<string, ITileWant>>();
  const inFlight = new Map<string, AbortController>();
  const failed = new Set<string>();
  let isDisposed = false;

  const mergedWants = (): Map<string, ITileWant> => {
    const merged = new Map<string, ITileWant>();

    for (const wants of ownerWants.values()) {
      for (const tile of wants.values()) {
        if (isBetter(tile, merged.get(tile.url))) {
          merged.set(tile.url, tile);
        }
      }
    }

    return merged;
  };

  const forgetDelivered = (url: string): void => {
    for (const wants of ownerWants.values()) {
      wants.delete(url);
    }
  };

  const settle = (url: string, controller: AbortController): boolean => {
    if (inFlight.get(url) !== controller) {
      return false;
    }

    inFlight.delete(url);

    return !controller.signal.aborted;
  };

  const pump = (): void => {
    if (isDisposed || inFlight.size >= options.concurrency) {
      return;
    }

    const candidates = [...mergedWants().values()].filter(
      (tile) => !inFlight.has(tile.url) && !failed.has(tile.url),
    );

    candidates.sort(byPriority);

    for (const tile of candidates.slice(0, options.concurrency - inFlight.size)) {
      start(tile.url);
    }
  };

  const handleLoaded = (url: string, controller: AbortController, image: TImage): void => {
    if (!settle(url, controller)) {
      options.discard(image);

      return;
    }

    forgetDelivered(url);
    options.onLoaded(url, image);
    pump();
  };

  const handleFailed = (url: string, controller: AbortController, error: unknown): void => {
    if (!settle(url, controller) || isAbortError(error)) {
      pump();

      return;
    }

    failed.add(url);
    options.onFailed(url, error);
    pump();
  };

  function start(url: string): void {
    const controller = new AbortController();

    inFlight.set(url, controller);
    options.load(url, controller.signal).then(
      (image) => {
        handleLoaded(url, controller, image);
      },
      (error: unknown) => {
        handleFailed(url, controller, error);
      },
    );
  }

  const want = (owner: object, wants: readonly ITileWant[]): void => {
    if (isDisposed) {
      return;
    }

    if (wants.length === 0) {
      ownerWants.delete(owner);
    } else {
      ownerWants.set(owner, new Map(wants.map((tile) => [tile.url, tile])));
    }

    const merged = mergedWants();

    for (const [url, controller] of inFlight) {
      if (!merged.has(url)) {
        inFlight.delete(url);
        controller.abort();
      }
    }

    for (const url of failed) {
      if (!merged.has(url)) {
        failed.delete(url);
      }
    }

    pump();
  };

  return {
    want,
    forgetFailures: (urls) => {
      for (const url of urls) {
        failed.delete(url);
      }

      pump();
    },
    isFailed: (url) => failed.has(url),
    dispose: () => {
      isDisposed = true;
      ownerWants.clear();

      for (const controller of inFlight.values()) {
        controller.abort();
      }

      inFlight.clear();
    },
  };
};
