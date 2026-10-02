import type { IPanoViewerSnapshot } from '../state/viewer-state-types';
import { type IScenePlace, resolveScenePlace } from '../tour/scene-place';
import { resolveSceneLimits, resolveSceneView } from '../tour/tour-defaults';
import { type IMoveGeometry, resolveMoveGeometry } from './move-geometry';
import { EnumSceneView, EnumTransitionType } from './navigation-dictionaries';
import type {
  INavigatorFrame,
  INavigatorSession,
  ISceneNavigatorHost,
  ISceneRecord,
} from './navigator-types';
import { resolveViewAfterSwitch, viewTurnOf } from './show-scene-options';
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
  presentCamera: (sceneSwitch: ISceneSwitch<TSession>, turnDegrees: number) => void;
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

  const presentCamera = (
    { tour, scene, options, record }: ISceneSwitch<TSession>,
    turnDegrees: number,
  ): void => {
    host.present({
      tour,
      scene,
      view: resolveViewAfterSwitch(options.view, host.getView(), resolveSceneView(tour, scene), turnDegrees),
      limits: resolveSceneLimits(tour, scene),
      pixelsPerRadian: record.state.pixelsPerRadian,
      keepMotion: options.keepMotion,
    });
    state.displayed = { sceneId: scene.id, record, place: resolveScenePlace(tour, scene) };
    host.requestFrame();
  };

  const moveGeometryOf = (
    sceneSwitch: ISceneSwitch<TSession>,
    from: IScenePlace,
    to: IScenePlace,
  ): IMoveGeometry | null => {
    const { move } = sceneSwitch.options.transition;

    return move === null
      ? null
      : resolveMoveGeometry({
          from,
          to,
          view: host.getView(),
          point: move.point,
          turn: move.turn,
          blur: move.blur,
        });
  };

  const appear = (sceneSwitch: ISceneSwitch<TSession>, from: ISceneRecord<TSession>): void => {
    const { transition, view } = sceneSwitch.options;
    const isLive = view === EnumSceneView.Keep;
    const previousView = isLive ? null : host.getView();
    const fromPlace = state.displayed?.place ?? null;
    const toPlace = resolveScenePlace(sceneSwitch.tour, sceneSwitch.scene);
    const turnDegrees = viewTurnOf(transition.move?.turn ?? null, fromPlace, toPlace);
    const move = fromPlace === null ? null : moveGeometryOf(sceneSwitch, fromPlace, toPlace);

    finishBlend();
    presentCamera(sceneSwitch, isLive ? turnDegrees : 0);
    state.pending = null;

    if (transition.type === EnumTransitionType.Cut) {
      settlePromises(sceneSwitch.promises, true);
    } else {
      state.blend = {
        from,
        transition,
        previousView,
        previousYawShift: isLive ? -turnDegrees : 0,
        move,
        startMs: null,
        promises: sceneSwitch.promises,
      };
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

    return {
      current,
      previous: null,
      previousView: null,
      previousYawShift: 0,
      weight: 1,
      isAnimating: false,
      move: null,
    };
  };

  return { syncState, presentCamera, appear, finishBlend, frame };
};
