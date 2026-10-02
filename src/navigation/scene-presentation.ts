import type { IPanoViewerSnapshot } from '../state/viewer-state-types';
import { resolveSceneLimits, resolveSceneView } from '../tour/tour-defaults';
import { EnumSceneView, EnumTransitionType } from './navigation-dictionaries';
import type {
  INavigatorFrame,
  INavigatorSession,
  ISceneNavigatorHost,
  ISceneRecord,
} from './navigator-types';
import { resolveViewAfterSwitch } from './show-scene-options';
import {
  type IBlendState,
  type IDisplayedScene,
  type ISceneSwitch,
  blendFrame,
  isDefined,
  settlePromises,
} from './switch-state';

/**
 * Изменяемое состояние смены сцен, общее для показа и для приёма вызовов: сцена на экране, ожидающая
 * смена и идущее смешивание.
 */
export interface ISwitcherState<TSession extends INavigatorSession> {
  displayed: IDisplayedScene<TSession> | null;
  pending: ISceneSwitch<TSession> | null;
  blend: IBlendState<TSession> | null;
}

export interface IScenePresentationOptions<TSession extends INavigatorSession> {
  host: ISceneNavigatorHost<TSession>;
  state: ISwitcherState<TSession>;
  protect: (keys: readonly string[]) => void;
  setPreloadsPaused: (isPaused: boolean) => void;
}

export interface IScenePresentation<TSession extends INavigatorSession> {
  syncState: (changes?: Partial<IPanoViewerSnapshot>) => void;
  presentCamera: (sceneSwitch: ISceneSwitch<TSession>) => void;
  appear: (sceneSwitch: ISceneSwitch<TSession>, from: ISceneRecord<TSession>) => void;
  finishBlend: () => void;
  frame: (timeMs: number) => INavigatorFrame<TSession>;
}

/**
 * Показ сцены на экране: камера новой сцены в момент её появления, мгновенная смена или смешивание и
 * производное состояние — защита в кэше, `isTransitioning`, пауза предзагрузок. `syncState` принимает
 * сопутствующие изменения снимка, чтобы подписчики не видели промежуточного состояния.
 */
export const createScenePresentation = <TSession extends INavigatorSession>({
  host,
  state,
  protect,
  setPreloadsPaused,
}: IScenePresentationOptions<TSession>): IScenePresentation<TSession> => {
  const syncState = (changes: Partial<IPanoViewerSnapshot> = {}): void => {
    const { displayed, pending, blend } = state;

    protect([displayed?.record.key, blend?.from.key, pending?.record.key].filter(isDefined));
    host.store.update({
      ...changes,
      isTransitioning: (pending !== null && pending.hasPrevious && !pending.isFailed) || blend !== null,
    });
    setPreloadsPaused(pending !== null && !pending.isFailed);
  };

  const finishBlend = (): void => {
    if (state.blend === null) {
      return;
    }

    settlePromises(state.blend.promises, true);
    state.blend = null;
    syncState();
  };

  const presentCamera = ({ tour, scene, options, record }: ISceneSwitch<TSession>): void => {
    host.present({
      tour,
      scene,
      view: resolveViewAfterSwitch(options.view, host.getView(), resolveSceneView(tour, scene)),
      limits: resolveSceneLimits(tour, scene),
      pixelsPerRadian: record.state.pixelsPerRadian,
      keepMotion: options.keepMotion,
    });
    state.displayed = { sceneId: scene.id, record };
    host.requestFrame();
  };

  const appear = (sceneSwitch: ISceneSwitch<TSession>, from: ISceneRecord<TSession>): void => {
    const { transition, view } = sceneSwitch.options;
    const previousView = view === EnumSceneView.Keep ? null : host.getView();

    finishBlend();
    presentCamera(sceneSwitch);
    state.pending = null;

    if (transition.type === EnumTransitionType.Cut) {
      settlePromises(sceneSwitch.promises, true);
    } else {
      state.blend = { from, transition, previousView, startMs: null, promises: sceneSwitch.promises };
    }

    syncState();
  };

  const frame = (timeMs: number): INavigatorFrame<TSession> => {
    const current = state.displayed?.record.session ?? null;
    const blendingFrame = state.blend === null ? null : blendFrame(state.blend, current, timeMs);

    if (blendingFrame !== null) {
      return blendingFrame;
    }

    finishBlend();

    return { current, previous: null, previousView: null, weight: 1, isAnimating: false };
  };

  return { syncState, presentCamera, appear, finishBlend, frame };
};
