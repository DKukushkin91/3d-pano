import { EnumViewerStatus } from '../state/viewer-dictionaries';
import { type IScenePlace, resolveScenePlace } from '../tour/scene-place';
import type { IScene, ITour, IView } from '../tour/tour-types';
import { type IDeferred, createDeferred } from './deferred';
import { type IMoveGeometry, moveFrameAt } from './move-geometry';
import type {
  INavigatorFrame,
  INavigatorMove,
  INavigatorSession,
  ISceneRecord,
  ISceneSessionState,
  ISceneTarget,
} from './navigator-types';
import { sceneKeyOf } from './scene-key';
import {
  type IResolvedShowSceneOptions,
  type IResolvedTransition,
  resolveSceneTarget,
  viewTurnOf,
} from './show-scene-options';
import { isTransitionFinished, transitionWeight } from './transition-weight';

/**
 * Принятая смена сцены. `promises` — промис вызова и забранных предзагрузок; `hasPrevious` — была ли на
 * экране готовая сцена в момент вызова (тогда новая ждёт полной загрузки и считается переходом);
 * `target` — кадр готовности, зафиксированный в момент вызова.
 */
export interface ISceneSwitch<TSession extends INavigatorSession> {
  tour: ITour;
  scene: IScene;
  record: ISceneRecord<TSession>;
  options: IResolvedShowSceneOptions;
  target: ISceneTarget;
  promises: IDeferred<boolean>[];
  hasPrevious: boolean;
  isFailed: boolean;
}

/**
 * Идущее смешивание. `startMs` ставится первым кадром, чтобы время загрузки не съедало переход;
 * `previousView` — замершая камера старой сцены, `null` — общая живая камера.
 */
export interface IBlendState<TSession extends INavigatorSession> {
  from: ISceneRecord<TSession>;
  transition: IResolvedTransition;
  previousView: IView | null;
  previousYawShift: number;
  move: IMoveGeometry | null;
  startMs: number | null;
  promises: IDeferred<boolean>[];
}

/**
 * Сцена на экране и её место в мире — от него считаются доворот и шаг к следующей сцене.
 */
export interface IDisplayedScene<TSession extends INavigatorSession> {
  sceneId: string;
  record: ISceneRecord<TSession>;
  place: IScenePlace;
}

/**
 * Сессия для новой смены: готовая из кэша, начатая предзагрузка (с промисом хоста) или новая.
 */
export interface IAcquiredRecord<TSession extends INavigatorSession> {
  record: ISceneRecord<TSession>;
  promises: IDeferred<boolean>[];
}

export const INITIAL_SESSION_STATE: Readonly<ISceneSessionState> = Object.freeze({
  status: EnumViewerStatus.Loading,
  loadProgress: 0,
  pixelsPerRadian: null,
});

export const settlePromises = (promises: readonly IDeferred<boolean>[], value: boolean): void => {
  for (const deferred of promises) {
    deferred.resolve(value);
  }
};

export const rejectPromises = (promises: readonly IDeferred<boolean>[], error: unknown): void => {
  for (const deferred of promises) {
    deferred.reject(error);
  }
};

export const isDefined = <TValue>(value: TValue | undefined): value is TValue => value !== undefined;

const moveOf = (geometry: IMoveGeometry, progress: number, eased: number): INavigatorMove => {
  const frame = moveFrameAt(geometry, progress, eased);

  return {
    current: { offset: frame.toOffset, model: geometry.toModel },
    previous: { offset: frame.fromOffset, model: geometry.fromModel },
    blurStrength: frame.blurStrength,
    target: geometry.step,
  };
};

/**
 * Кадр смешивания или шага для момента `timeMs`, `null` — переход закончился. Сдвиги камеры идут по тому же
 * сглаженному прогрессу, что и вес новой сцены.
 */
export const blendFrame = <TSession extends INavigatorSession>(
  blend: IBlendState<TSession>,
  current: TSession | null,
  timeMs: number,
): INavigatorFrame<TSession> | null => {
  blend.startMs ??= timeMs;

  const elapsedMs = timeMs - blend.startMs;

  if (isTransitionFinished(blend.transition, elapsedMs)) {
    return null;
  }

  const weight = transitionWeight(blend.transition, elapsedMs);
  const progress = elapsedMs / blend.transition.durationMs;

  return {
    current,
    previous: blend.from.session,
    previousView: blend.previousView,
    previousYawShift: blend.previousYawShift,
    weight,
    isAnimating: true,
    move: blend.move === null ? null : moveOf(blend.move, progress, weight),
  };
};

/**
 * Повторный вызов той же сцены, пока она грузится, не перезапускает загрузку: прежний вызывающий
 * получает `false` (его перебили), новый ждёт ту же загрузку со своими опциями.
 */
export const isSamePendingScene = <TSession extends INavigatorSession>(
  pending: ISceneSwitch<TSession>,
  scene: IScene,
): boolean => !pending.isFailed && pending.scene.id === scene.id && pending.record.key === sceneKeyOf(scene);

export const replacePendingCaller = <TSession extends INavigatorSession>(
  pending: ISceneSwitch<TSession>,
  options: IResolvedShowSceneOptions,
): Promise<boolean> => {
  const deferred = createDeferred<boolean>();
  const [previousCaller, ...linked] = pending.promises;

  previousCaller?.resolve(false);
  pending.promises = [deferred, ...linked];
  pending.options = options;

  return deferred.promise;
};

/**
 * Кадр готовности смены: вид появления с доворотом от сцены на экране (`fromPlace`, `null` — её нет).
 */
export const switchTargetOf = (
  tour: ITour,
  scene: IScene,
  options: IResolvedShowSceneOptions,
  currentView: IView,
  fromPlace: IScenePlace | null,
): ISceneTarget => {
  const turnDegrees =
    fromPlace === null
      ? 0
      : viewTurnOf(options.transition.move?.turn ?? null, fromPlace, resolveScenePlace(tour, scene));

  return resolveSceneTarget(tour, scene, options.view, currentView, false, turnDegrees);
};
