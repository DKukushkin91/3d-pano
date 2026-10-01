/**
 * Очередь предзагрузок: задачи стартуют по одной в порядке вызовов и только без паузы. Пауза держится,
 * пока грузится сцена на экране или переходная, — соседние комнаты не отнимают у неё сеть и декодер.
 */
export interface IPreloadQueue<TJob> {
  enqueue: (key: string, job: TJob) => void;
  find: (key: string) => TJob | undefined;
  take: (key: string) => TJob | undefined;
  finish: (key: string) => void;
  setPaused: (isPaused: boolean) => void;
  removeWhere: (predicate: (key: string) => boolean) => TJob[];
}

interface IQueuedJob<TJob> {
  key: string;
  job: TJob;
}

export const createPreloadQueue = <TJob>(startJob: (job: TJob) => void): IPreloadQueue<TJob> => {
  let waiting: IQueuedJob<TJob>[] = [];
  let active: IQueuedJob<TJob> | null = null;
  let isPaused = false;

  const startNext = (): void => {
    if (isPaused || active !== null) {
      return;
    }

    const [next, ...rest] = waiting;

    if (next === undefined) {
      return;
    }

    waiting = rest;
    active = next;
    startJob(next.job);
  };

  const take = (key: string): TJob | undefined => {
    if (active?.key === key) {
      const { job } = active;

      active = null;
      startNext();

      return job;
    }

    const queued = waiting.find((entry) => entry.key === key);

    waiting = waiting.filter((entry) => entry !== queued);

    return queued?.job;
  };

  return {
    enqueue: (key, job) => {
      waiting = [...waiting, { key, job }];
      startNext();
    },
    find: (key) => (active?.key === key ? active.job : waiting.find((entry) => entry.key === key)?.job),
    take,
    finish: (key) => {
      if (active?.key === key) {
        active = null;
        startNext();
      }
    },
    setPaused: (nextIsPaused) => {
      isPaused = nextIsPaused;
      startNext();
    },
    removeWhere: (predicate) => {
      const removed = [active, ...waiting].filter(
        (entry): entry is IQueuedJob<TJob> => entry !== null && predicate(entry.key),
      );

      waiting = waiting.filter((entry) => !removed.includes(entry));

      if (active !== null && removed.includes(active)) {
        active = null;
      }

      startNext();

      return removed.map((entry) => entry.job);
    },
  };
};
