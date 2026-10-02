import { isAbortError } from '../resources/load-errors';
import { findStartScene, resolveSceneLimits } from '../tour/tour-defaults';
import type { IScene, ITour } from '../tour/tour-types';
import { validateTour } from '../tour/validate-tour';
import type { IPreloadSceneOptions, ISetTourOptions, IShowSceneOptions } from './navigation-types';
import type {
  INavigatorFrame,
  INavigatorSession,
  ISceneNavigatorHost,
  ISceneRecord,
  ISceneTarget,
} from './navigator-types';
import { createSceneCache } from './scene-cache';
import { invalidTourError, unknownSceneError } from './scene-errors';
import { sceneKeyOf } from './scene-key';
import { createScenePreloader, toSceneLoadError } from './scene-preloader';
import { createRecordFactory } from './scene-records';
import { createSceneSwitcher } from './scene-switcher';
import { resolvePreloadSceneView, resolveSceneTarget, resolveShowSceneOptions } from './show-scene-options';
import type { IAcquiredRecord } from './switch-state';

/**
 * Публичная часть навигации: `showScene`, `preloadScene`, `setTour` и `retry` просмотрщика, кадр для
 * отрисовщика и бюджет кэша.
 */
export interface ISceneNavigator<TSession extends INavigatorSession> {
  showScene: (sceneId: string, options?: IShowSceneOptions) => Promise<boolean>;
  preloadScene: (sceneId: string, options?: IPreloadSceneOptions) => Promise<boolean>;
  setTour: (tour: ITour, options?: ISetTourOptions) => Promise<boolean>;
  retry: () => Promise<void>;
  frame: (timeMs: number) => INavigatorFrame<TSession>;
  setCacheBudget: (megabytes: number) => void;
  destroy: () => void;
}

const findScene = (tour: ITour | null, sceneId: string): IScene | undefined =>
  tour?.scenes.find((scene) => scene.id === sceneId);

/**
 * Навигатор сцен. Ошибки программиста (неверные опции) бросаются синхронно; неизвестная сцена и
 * невалидный тур отклоняют промис, ничего не меняя. Сессии, камера и кадры приходят через `host`, поэтому
 * вся логика проверяется в Node с поддельными сессиями.
 */
export const createSceneNavigator = <TSession extends INavigatorSession>(
  host: ISceneNavigatorHost<TSession>,
  cacheMegabytes: number,
): ISceneNavigator<TSession> => {
  const cache = createSceneCache<ISceneRecord<TSession>>(cacheMegabytes, (record) => {
    record.session.dispose();
  });
  let budgetMegabytes = cacheMegabytes;
  let tour: ITour | null = null;
  let isDestroyed = false;

  const createRecord = createRecordFactory<TSession>(host, (record, state) => {
    switcher.handleRecordChange(record, state);
  });

  const storeRecord = (record: ISceneRecord<TSession>): boolean =>
    cache.add(record.key, record, record.session.byteSize());

  const preloader = createScenePreloader<TSession>({
    createRecord: (scene) => createRecord(scene, false),
    storeRecord,
  });

  const acquireRecord = (scene: IScene, withPreview: boolean): IAcquiredRecord<TSession> => {
    const key = sceneKeyOf(scene);
    const cached = cache.get(key);

    if (cached !== undefined) {
      return { record: cached, promises: [] };
    }

    const adopted = preloader.adopt(key);

    return {
      record: adopted?.record ?? createRecord(scene, withPreview),
      promises: adopted === null ? [] : [adopted.deferred],
    };
  };

  const switcher = createSceneSwitcher<TSession>({
    host,
    acquireRecord,
    storeRecord: (record) => {
      storeRecord(record);
    },
    protect: cache.protect,
    setPreloadsPaused: preloader.setPaused,
  });

  const prepareCached = (
    record: ISceneRecord<TSession>,
    target: ISceneTarget,
    sceneId: string,
  ): Promise<boolean> =>
    record.session.isReadyFor(target)
      ? Promise.resolve(true)
      : record.session.load(target).then(
          () => cache.get(record.key) === record,
          (error: unknown) => {
            if (isAbortError(error)) {
              return false;
            }

            throw toSceneLoadError(error, sceneId);
          },
        );

  const preloadScene = (sceneId: string, options?: IPreloadSceneOptions): Promise<boolean> => {
    const view = resolvePreloadSceneView(options);
    const scene = findScene(tour, sceneId);

    if (isDestroyed) {
      return Promise.resolve(false);
    }

    if (tour === null || scene === undefined) {
      return Promise.reject(unknownSceneError(sceneId));
    }

    const key = sceneKeyOf(scene);
    const target = resolveSceneTarget(tour, scene, view, host.getView(), true);
    const cached = cache.get(key);

    if (switcher.isOnScreen(scene)) {
      return Promise.resolve(true);
    }

    if (cached !== undefined) {
      return prepareCached(cached, target, sceneId);
    }

    const following = switcher.followPending(key);

    if (following !== null) {
      return following;
    }

    if (budgetMegabytes === 0) {
      return Promise.resolve(false);
    }

    return preloader.preload(scene, key, target);
  };

  const setTour = (nextTour: ITour, options?: ISetTourOptions): Promise<boolean> => {
    const resolved = resolveShowSceneOptions(options);

    if (isDestroyed) {
      return Promise.resolve(false);
    }

    const issues = validateTour(nextTour);

    if (issues.length > 0) {
      return Promise.reject(invalidTourError(issues));
    }

    const scene =
      options?.scene === undefined ? findStartScene(nextTour) : findScene(nextTour, options.scene);

    if (scene === undefined) {
      return Promise.reject(unknownSceneError(options?.scene ?? ''));
    }

    tour = nextTour;
    preloader.dropMissing(new Set(nextTour.scenes.map(sceneKeyOf)));

    if (switcher.isOnScreen(scene)) {
      host.refreshScene({ tour: nextTour, scene, limits: resolveSceneLimits(nextTour, scene) });

      return switcher.stayOnScreen(scene.id);
    }

    return switcher.switchTo(nextTour, scene, resolved);
  };

  return {
    showScene: (sceneId, options) => {
      const resolved = resolveShowSceneOptions(options);
      const scene = findScene(tour, sceneId);

      if (isDestroyed) {
        return Promise.resolve(false);
      }

      if (tour === null || scene === undefined) {
        return Promise.reject(unknownSceneError(sceneId));
      }

      return switcher.isOnScreen(scene)
        ? switcher.stayOnScreen(scene.id)
        : switcher.switchTo(tour, scene, resolved);
    },
    preloadScene,
    setTour,
    retry: () => (isDestroyed ? Promise.resolve() : switcher.retry()),
    frame: switcher.frame,
    setCacheBudget: (megabytes) => {
      budgetMegabytes = megabytes;
      cache.setBudget(megabytes);
    },
    destroy: () => {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      switcher.cancelAll();
      preloader.destroy();
      cache.clear();
    },
  };
};
