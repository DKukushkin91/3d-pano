import { isAbortError } from '../resources/load-errors';
import { EnumErrorCategory, EnumViewerStatus } from '../state/viewer-dictionaries';
import type { IPanoViewerSnapshot } from '../state/viewer-state-types';
import type { IScene, ITour } from '../tour/tour-types';
import { createDeferred } from './deferred';
import type {
  INavigatorFrame,
  INavigatorSession,
  ISceneNavigatorHost,
  ISceneRecord,
  ISceneSessionState,
} from './navigator-types';
import { sceneKeyOf } from './scene-key';
import { toSceneLoadError } from './scene-preloader';
import { type ISwitcherState, createScenePresentation } from './scene-presentation';
import type { IResolvedShowSceneOptions } from './show-scene-options';
import {
  type IAcquiredRecord,
  type ISceneSwitch,
  isSamePendingScene,
  rejectPromises,
  replacePendingCaller,
  settlePromises,
} from './switch-state';

export interface ISceneSwitcherOptions<TSession extends INavigatorSession> {
  host: ISceneNavigatorHost<TSession>;
  acquireRecord: (scene: IScene, withPreview: boolean) => IAcquiredRecord<TSession>;
  storeRecord: (record: ISceneRecord<TSession>) => void;
  protect: (keys: readonly string[]) => void;
  setPreloadsPaused: (isPaused: boolean) => void;
}

/**
 * Смена сцен: сцена на экране, ожидающая смена и смешивание. Проверку аргументов, кэш и предзагрузку
 * ведёт навигатор, сюда приходят уже найденные сцены и разрешённые опции.
 */
export interface ISceneSwitcher<TSession extends INavigatorSession> {
  handleRecordChange: (record: ISceneRecord<TSession>, state: ISceneSessionState) => void;
  isOnScreen: (scene: IScene) => boolean;
  switchTo: (tour: ITour, scene: IScene, options: IResolvedShowSceneOptions) => Promise<boolean>;
  stayOnScreen: (sceneId: string) => Promise<boolean>;
  followPending: (key: string) => Promise<boolean> | null;
  retry: () => Promise<void>;
  frame: (timeMs: number) => INavigatorFrame<TSession>;
  cancelAll: () => void;
}

/**
 * Последний вызов побеждает: перебитая смена разрешается `false`, её незаконченная сессия освобождается.
 * Пока новая сцена грузится, на экране остаётся старая; без готовой сцены на экране новая появляется
 * сразу и показывает превью по мере загрузки.
 */
export const createSceneSwitcher = <TSession extends INavigatorSession>({
  host,
  acquireRecord,
  storeRecord,
  protect,
  setPreloadsPaused,
}: ISceneSwitcherOptions<TSession>): ISceneSwitcher<TSession> => {
  const { store, emitter } = host;
  const state: ISwitcherState<TSession> = { displayed: null, pending: null, blend: null };
  const { syncState, presentCamera, appear, frame } = createScenePresentation({
    host,
    state,
    protect,
    setPreloadsPaused,
  });

  const hasSceneOnScreen = (): boolean => state.displayed?.record.isComplete === true;

  const publishScene = (sceneId: string, changes: Partial<IPanoViewerSnapshot>): void => {
    const previousSceneId = store.getSnapshot().sceneId;

    store.update({ ...changes, sceneId });

    if (previousSceneId !== sceneId) {
      emitter.emit('sceneChange', { sceneId, previousSceneId });
    }
  };

  const cancelPending = (): void => {
    const cancelled = state.pending;

    if (cancelled === null) {
      return;
    }

    state.pending = null;
    settlePromises(cancelled.promises, false);

    if (!cancelled.hasPrevious && state.displayed?.record === cancelled.record) {
      state.displayed = null;
    }

    if (!cancelled.record.isComplete) {
      cancelled.record.session.dispose();
    }
  };

  const supersedeBlend = (): void => {
    if (state.blend !== null) {
      settlePromises(state.blend.promises, false);
      state.blend.promises = [];
    }
  };

  const completeSwitch = (sceneSwitch: ISceneSwitch<TSession>): void => {
    store.update({ status: EnumViewerStatus.Ready, loadProgress: 1, error: null });
    emitter.emit('sceneReady', { sceneId: sceneSwitch.scene.id });

    const from = state.displayed?.record;

    if (sceneSwitch !== state.pending) {
      return;
    }

    if (sceneSwitch.hasPrevious && from !== undefined) {
      appear(sceneSwitch, from);

      return;
    }

    state.pending = null;
    settlePromises(sceneSwitch.promises, true);
    syncState();
  };

  const handleSwitchFailed = (sceneSwitch: ISceneSwitch<TSession>, error: unknown): void => {
    if (sceneSwitch !== state.pending || isAbortError(error)) {
      return;
    }

    const loadError = toSceneLoadError(error, sceneSwitch.scene.id);

    sceneSwitch.isFailed = true;
    store.update({ status: EnumViewerStatus.Error, error: loadError.details });
    syncState();
    emitter.emit('error', { error: loadError.details });
    rejectPromises(sceneSwitch.promises, loadError);
  };

  const handleSwitchLoaded = (sceneSwitch: ISceneSwitch<TSession>): void => {
    if (sceneSwitch !== state.pending) {
      return;
    }

    sceneSwitch.record.isComplete = true;
    syncState();
    storeRecord(sceneSwitch.record);
    completeSwitch(sceneSwitch);
  };

  const watchLoading = (sceneSwitch: ISceneSwitch<TSession>, loading: Promise<void>): void => {
    loading.then(
      () => {
        handleSwitchLoaded(sceneSwitch);
      },
      (error: unknown) => {
        handleSwitchFailed(sceneSwitch, error);
      },
    );
  };

  const startSwitch = (sceneSwitch: ISceneSwitch<TSession>, loading: Promise<void> | null): void => {
    if (!sceneSwitch.hasPrevious) {
      presentCamera(sceneSwitch);
      syncState();
    }

    if (sceneSwitch.record.isComplete) {
      completeSwitch(sceneSwitch);
    } else {
      watchLoading(sceneSwitch, loading ?? sceneSwitch.record.session.load());
    }
  };

  const acceptSwitch = (tour: ITour, scene: IScene, options: IResolvedShowSceneOptions): Promise<boolean> => {
    cancelPending();
    supersedeBlend();

    const hasPrevious = hasSceneOnScreen();
    const acquired = acquireRecord(scene, !hasPrevious);
    const deferred = createDeferred<boolean>();
    const sceneSwitch: ISceneSwitch<TSession> = {
      tour,
      scene,
      record: acquired.record,
      options,
      promises: [deferred, ...acquired.promises],
      hasPrevious,
      isFailed: false,
    };

    state.pending = sceneSwitch;
    syncState();
    publishScene(scene.id, {
      status: EnumViewerStatus.Loading,
      loadProgress: sceneSwitch.record.isComplete ? 1 : sceneSwitch.record.state.loadProgress,
      error: null,
    });

    if (sceneSwitch === state.pending) {
      emitter.emit('sceneLoadStart', { sceneId: scene.id });
    }

    if (sceneSwitch === state.pending) {
      startSwitch(sceneSwitch, acquired.loading);
    }

    return deferred.promise;
  };

  const retry = (): Promise<void> => {
    const failed = state.pending;
    const isResourceError = store.getSnapshot().error?.category === EnumErrorCategory.Resource;

    if (failed === null || !failed.isFailed || !isResourceError) {
      return Promise.resolve();
    }

    const loading = failed.record.session.load();

    failed.isFailed = false;
    store.update({ status: failed.record.state.status, error: null });
    syncState();
    watchLoading(failed, loading);

    return loading.then(
      () => undefined,
      (error: unknown) => {
        if (failed === state.pending && !isAbortError(error)) {
          throw toSceneLoadError(error, failed.scene.id);
        }
      },
    );
  };

  return {
    handleRecordChange: (record, sessionState) => {
      record.state = sessionState;

      if (record === state.displayed?.record) {
        host.setSourceDensity(sessionState.pixelsPerRadian);
        host.requestFrame();
      }

      const isPendingProgress =
        record === state.pending?.record &&
        !state.pending.isFailed &&
        sessionState.status !== EnumViewerStatus.Ready;

      if (isPendingProgress) {
        store.update({ status: sessionState.status, loadProgress: sessionState.loadProgress });
      }
    },
    isOnScreen: (scene) =>
      hasSceneOnScreen() &&
      state.displayed?.sceneId === scene.id &&
      state.displayed.record.key === sceneKeyOf(scene),
    switchTo: (tour, scene, options) =>
      state.pending !== null && isSamePendingScene(state.pending, scene)
        ? replacePendingCaller(state.pending, options)
        : acceptSwitch(tour, scene, options),
    stayOnScreen: (sceneId) => {
      cancelPending();
      syncState();
      publishScene(sceneId, { status: EnumViewerStatus.Ready, loadProgress: 1, error: null });

      return Promise.resolve(true);
    },
    followPending: (key) => {
      if (state.pending === null || state.pending.isFailed || state.pending.record.key !== key) {
        return null;
      }

      const deferred = createDeferred<boolean>();

      state.pending.promises.push(deferred);

      return deferred.promise;
    },
    retry,
    frame,
    cancelAll: () => {
      cancelPending();
      supersedeBlend();
      state.blend = null;
      state.displayed = null;
    },
  };
};
