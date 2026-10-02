import { PanoLoadError, toPanoError } from '../resources/load-errors';
import type { IScene } from '../tour/tour-types';
import { type IDeferred, createDeferred } from './deferred';
import type { INavigatorSession, ISceneRecord, ISceneTarget } from './navigator-types';
import { createPreloadQueue } from './preload-queue';

/**
 * Предзагрузка, которую забрала смена сцены: начатая сессия (или `null`, если очередь до неё не дошла) и
 * промис хоста, который теперь завершает смена. Повторный `load` начатой сессии загрузку не перезапускает.
 */
export interface IAdoptedPreload<TSession extends INavigatorSession> {
  record: ISceneRecord<TSession> | null;
  deferred: IDeferred<boolean>;
}

export interface IScenePreloader<TSession extends INavigatorSession> {
  preload: (scene: IScene, key: string, target: ISceneTarget) => Promise<boolean>;
  adopt: (key: string) => IAdoptedPreload<TSession> | null;
  setPaused: (isPaused: boolean) => void;
  dropMissing: (keys: ReadonlySet<string>) => void;
  destroy: () => void;
}

export interface IScenePreloaderOptions<TSession extends INavigatorSession> {
  createRecord: (scene: IScene) => ISceneRecord<TSession>;
  storeRecord: (record: ISceneRecord<TSession>) => boolean;
}

interface IPreloadJob<TSession extends INavigatorSession> {
  key: string;
  scene: IScene;
  target: ISceneTarget;
  deferred: IDeferred<boolean>;
  record: ISceneRecord<TSession> | null;
  isReleased: boolean;
}

/**
 * Ошибка загрузки для промиса: исключение конвейера с готовым описанием или непредвиденный сбой,
 * описанный как сетевой.
 */
export const toSceneLoadError = (error: unknown, sceneId: string): PanoLoadError =>
  error instanceof PanoLoadError ? error : new PanoLoadError(toPanoError(error, `scene "${sceneId}"`));

/**
 * Предзагрузка сцен в фоне через очередь. Результат задачи игнорируется, если её забрала смена сцены или
 * сняла замена тура: тогда промисом хоста распоряжается тот, кто её забрал.
 */
export const createScenePreloader = <TSession extends INavigatorSession>(
  options: IScenePreloaderOptions<TSession>,
): IScenePreloader<TSession> => {
  const handleJobLoaded = (job: IPreloadJob<TSession>, record: ISceneRecord<TSession>): void => {
    if (job.isReleased) {
      return;
    }

    job.isReleased = true;
    record.isComplete = true;
    job.deferred.resolve(options.storeRecord(record));
    queue.finish(job.key);
  };

  const handleJobFailed = (
    job: IPreloadJob<TSession>,
    record: ISceneRecord<TSession>,
    error: unknown,
  ): void => {
    if (job.isReleased) {
      return;
    }

    job.isReleased = true;
    record.session.dispose();
    job.deferred.reject(toSceneLoadError(error, job.scene.id));
    queue.finish(job.key);
  };

  const startJob = (job: IPreloadJob<TSession>): void => {
    const record = options.createRecord(job.scene);

    job.record = record;
    record.session.load(job.target).then(
      () => {
        handleJobLoaded(job, record);
      },
      (error: unknown) => {
        handleJobFailed(job, record, error);
      },
    );
  };

  const queue = createPreloadQueue<IPreloadJob<TSession>>(startJob);

  const release = (job: IPreloadJob<TSession>): void => {
    job.isReleased = true;
    job.record?.session.dispose();
    job.deferred.resolve(false);
  };

  return {
    preload: (scene, key, target) => {
      const existing = queue.find(key);

      if (existing !== undefined) {
        return existing.deferred.promise;
      }

      const job: IPreloadJob<TSession> = {
        key,
        scene,
        target,
        deferred: createDeferred<boolean>(),
        record: null,
        isReleased: false,
      };

      queue.enqueue(key, job);

      return job.deferred.promise;
    },
    adopt: (key) => {
      const job = queue.take(key);

      if (job === undefined) {
        return null;
      }

      job.isReleased = true;

      return { record: job.record, deferred: job.deferred };
    },
    setPaused: queue.setPaused,
    dropMissing: (keys) => {
      queue.removeWhere((key) => !keys.has(key)).forEach(release);
    },
    destroy: () => {
      queue.removeWhere(() => true).forEach(release);
    },
  };
};
