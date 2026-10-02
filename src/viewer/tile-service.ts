import { type ITilePool, createTilePool } from '../render/tile-pool';
import { PanoLoadError, createPanoError } from '../resources/load-errors';
import { EnumErrorCode } from '../state/viewer-dictionaries';
import { tilePoolCapacity } from '../tiles/tile-pool-plan';
import { type ITileWant, TILE_REQUEST_CONCURRENCY, createTileQueue } from '../tiles/tile-queue';

/**
 * Что сервису тайлов нужно от тайловой сессии. Сессия узнаёт свои тайлы по URL; тайл подложки она
 * забирает себе, остальные кладутся в пул, и всем сессиям сообщается, где он лежит.
 */
export interface ITileSessionPort {
  tileSizeOf: (url: string) => number | null;
  acceptBaseTile: (url: string, image: ImageBitmap) => boolean;
  handlePlaced: (url: string, slot: number) => void;
  handleDropped: (url: string) => void;
  handleEvicted: (url: string) => void;
  handleFailed: (url: string, error: unknown) => void;
  handlePoolReset: () => void;
  handleHidden: () => void;
}

/**
 * Тайлы просмотрщика: одна очередь запросов и один пул на все сцены. Пул выделяется с первой тайловой
 * сценой и пересоздаётся при новом бюджете или размере тайла. Кадр отрисовки отмечается `startFrame` и
 * `finishFrame`: сцены на экране забирают место в пуле по очереди (`claimFrame`), их тайлы защищены от
 * вытеснения, а сцена, которой не было в кадре, считается ушедшей с экрана.
 */
export interface ITileService {
  register: (session: ITileSessionPort) => () => void;
  want: (owner: ITileSessionPort, wants: readonly ITileWant[]) => void;
  forgetFailures: (urls: readonly string[]) => void;
  usePool: (tileSize: number) => void;
  pool: () => ITilePool | null;
  capacity: () => number;
  fadeMs: () => number;
  startFrame: () => void;
  claimFrame: (session: ITileSessionPort, urls: readonly string[]) => string[];
  finishFrame: () => void;
  setBudget: (megabytes: number) => void;
  setFadeMs: (fadeMs: number) => void;
  dispose: () => void;
}

export interface ITileServiceOptions {
  gl: WebGL2RenderingContext;
  loadImage: (url: string, signal: AbortSignal) => Promise<ImageBitmap>;
  requestFrame: () => void;
  budgetMegabytes: number;
  fadeMs: number;
}

const wrongSizeError = (url: string, image: ImageBitmap, size: number): PanoLoadError =>
  new PanoLoadError(
    createPanoError(EnumErrorCode.InvalidImage, {
      message: `Tile ${url} is ${String(image.width)}×${String(image.height)}, expected ${String(size)}×${String(size)}`,
      url,
    }),
  );

export const createTileService = (options: ITileServiceOptions): ITileService => {
  const { gl } = options;
  const maxLayers = Number(gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS));
  const sessions = new Set<ITileSessionPort>();
  const protectedUrls = new Set<string>();
  const framed = new Set<ITileSessionPort>();
  let pool: ITilePool | null = null;
  let budgetMegabytes = options.budgetMegabytes;
  let fadeMs = options.fadeMs;
  let frameNumber = 0;
  let frameRoom = 0;

  const expectedSize = (url: string): number | null => {
    for (const session of sessions) {
      const size = session.tileSizeOf(url);

      if (size !== null) {
        return size;
      }
    }

    return null;
  };

  const loadTile = async (url: string, signal: AbortSignal): Promise<ImageBitmap> => {
    const image = await options.loadImage(url, signal);
    const size = expectedSize(url);

    if (size !== null && (image.width !== size || image.height !== size)) {
      image.close();
      throw wrongSizeError(url, image, size);
    }

    return image;
  };

  const placeInPool = (url: string, image: ImageBitmap): void => {
    const placement = pool?.upload(url, image, protectedUrls, frameNumber) ?? null;

    if (placement === null) {
      sessions.forEach((session) => session.handleDropped(url));

      return;
    }

    if (placement.evicted !== null) {
      const { evicted } = placement;

      sessions.forEach((session) => session.handleEvicted(evicted));
    }

    sessions.forEach((session) => session.handlePlaced(url, placement.slot));
  };

  const handleLoaded = (url: string, image: ImageBitmap): void => {
    const consumers = [...sessions].filter((session) => session.acceptBaseTile(url, image));

    if (consumers.length === 0 && expectedSize(url) !== null) {
      placeInPool(url, image);
    }

    image.close();
    options.requestFrame();
  };

  const queue = createTileQueue<ImageBitmap>({
    concurrency: TILE_REQUEST_CONCURRENCY,
    load: loadTile,
    discard: (image) => {
      image.close();
    },
    onLoaded: handleLoaded,
    onFailed: (url, error) => {
      sessions.forEach((session) => session.handleFailed(url, error));
    },
  });

  const rebuildPool = (tileSize: number): void => {
    pool?.dispose();
    pool = createTilePool(gl, tileSize, tilePoolCapacity(budgetMegabytes, tileSize, maxLayers));
    sessions.forEach((session) => session.handlePoolReset());
    options.requestFrame();
  };

  return {
    register: (session) => {
      sessions.add(session);

      return () => {
        sessions.delete(session);
        framed.delete(session);
        queue.want(session, []);
      };
    },
    want: (owner, wants) => {
      queue.want(owner, wants);
    },
    forgetFailures: queue.forgetFailures,
    usePool: (tileSize) => {
      if (pool?.tileSize !== tileSize) {
        rebuildPool(tileSize);
      }
    },
    pool: () => pool,
    capacity: () => pool?.slots.capacity ?? 0,
    fadeMs: () => fadeMs,
    startFrame: () => {
      frameNumber += 1;
      frameRoom = pool?.slots.capacity ?? 0;
      protectedUrls.clear();
    },
    claimFrame: (session, urls) => {
      const kept = urls.slice(0, Math.max(0, frameRoom));

      frameRoom -= kept.length;
      framed.add(session);

      for (const url of kept) {
        protectedUrls.add(url);
        pool?.slots.touch(url, frameNumber);
      }

      return kept;
    },
    finishFrame: () => {
      for (const session of sessions) {
        if (!framed.has(session)) {
          session.handleHidden();
        }
      }

      framed.clear();
    },
    setBudget: (megabytes) => {
      budgetMegabytes = megabytes;

      if (pool !== null) {
        rebuildPool(pool.tileSize);
      }
    },
    setFadeMs: (nextFadeMs) => {
      fadeMs = nextFadeMs;
    },
    dispose: () => {
      queue.dispose();
      pool?.dispose();
      pool = null;
      sessions.clear();
    },
  };
};
