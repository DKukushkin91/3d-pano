import { type IDeferred, createDeferred } from '../navigation/deferred';

/**
 * Ожидания готовности тайловой сцены: каждый вызов `load` ждёт свой набор — изображения превью, тайлы
 * подложки и тайлы кадра появления. Набор ключей у каждого ожидания свой, поэтому предзагрузка одного вида
 * и смена с другим видом не мешают друг другу; ошибка изображения отклоняет только ожидания, где оно есть.
 */
export interface ITileReadiness {
  add: (keys: readonly string[], isAvailable: (key: string) => boolean, isPreload: boolean) => Promise<void>;
  markAvailable: (key: string) => void;
  fail: (key: string, error: unknown) => void;
  pendingKeys: () => Set<string>;
  hasWaiters: () => boolean;
  isPreloadOnly: () => boolean;
  progress: () => number | null;
  rejectAll: (error: unknown) => void;
}

interface IReadinessWaiter {
  pending: Set<string>;
  total: number;
  isPreload: boolean;
  deferred: IDeferred<void>;
}

export const createTileReadiness = (): ITileReadiness => {
  let waiters: IReadinessWaiter[] = [];

  const settleFinished = (): void => {
    const finished = waiters.filter((waiter) => waiter.pending.size === 0);

    waiters = waiters.filter((waiter) => waiter.pending.size > 0);

    for (const waiter of finished) {
      waiter.deferred.resolve();
    }
  };

  return {
    add: (keys, isAvailable, isPreload) => {
      const waiter: IReadinessWaiter = {
        pending: new Set(keys.filter((key) => !isAvailable(key))),
        total: keys.length,
        isPreload,
        deferred: createDeferred<void>(),
      };

      waiters.push(waiter);
      settleFinished();

      return waiter.deferred.promise;
    },
    markAvailable: (key) => {
      for (const waiter of waiters) {
        waiter.pending.delete(key);
      }

      settleFinished();
    },
    fail: (key, error) => {
      const failed = waiters.filter((waiter) => waiter.pending.has(key));

      waiters = waiters.filter((waiter) => !waiter.pending.has(key));

      for (const waiter of failed) {
        waiter.deferred.reject(error);
      }
    },
    pendingKeys: () => new Set(waiters.flatMap((waiter) => [...waiter.pending])),
    hasWaiters: () => waiters.length > 0,
    isPreloadOnly: () => waiters.every((waiter) => waiter.isPreload),
    progress: () => {
      const latest = waiters.at(-1);

      return latest === undefined || latest.total === 0
        ? null
        : (latest.total - latest.pending.size) / latest.total;
    },
    rejectAll: (error) => {
      const rejected = waiters;

      waiters = [];

      for (const waiter of rejected) {
        waiter.deferred.reject(error);
      }
    },
  };
};
