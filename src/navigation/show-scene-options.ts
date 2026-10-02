import { EnumEasing, type TEasingFunction, resolveEasing } from '../math/easing';
import type { IScenePlace } from '../tour/scene-place';
import { LIBRARY_DEFAULT_VIEW, resolveSceneLimits, resolveSceneView } from '../tour/tour-defaults';
import type { IScene, ITour, IView, IViewSettings } from '../tour/tour-types';
import { applyViewSettings } from '../viewer/camera-state';
import { DEFAULT_MOVE_DURATION_MS, type IResolvedMove, resolveMove } from './move-options';
import {
  EnumSceneView,
  EnumTransitionType,
  type TSceneView,
  type TTransitionType,
} from './navigation-dictionaries';
import type { IPreloadSceneOptions, IShowSceneOptions, TSceneTransition } from './navigation-types';
import type { ISceneTarget } from './navigator-types';

/**
 * Переход с подставленными умолчаниями. Мгновенная смена — это переход длительностью 0; у шага есть
 * `move`, у остальных — `null`.
 */
export interface IResolvedTransition {
  type: TTransitionType;
  durationMs: number;
  easing: TEasingFunction;
  move: IResolvedMove | null;
}

export interface IResolvedShowSceneOptions {
  transition: IResolvedTransition;
  view: TSceneView | IViewSettings;
  keepMotion: boolean;
}

export const DEFAULT_BLEND_DURATION_MS = 500;
export const DEFAULT_BLEND_EASING: typeof EnumEasing.SineInOut = EnumEasing.SineInOut;
export const DEFAULT_MOVE_EASING: typeof EnumEasing.QuadOut = EnumEasing.QuadOut;

const CUT_TRANSITION: Readonly<IResolvedTransition> = Object.freeze({
  type: EnumTransitionType.Cut,
  durationMs: 0,
  easing: resolveEasing(EnumEasing.Linear),
  move: null,
});

const failRange = (name: string, requirement: string, value: unknown): never => {
  throw new RangeError(`3d-pano: option "${name}" must be ${requirement}, got ${String(value)}`);
};

const isTransitionType = (value: unknown): value is TTransitionType =>
  Object.values(EnumTransitionType).some((type) => type === value);

const isSceneView = (value: unknown): value is TSceneView =>
  Object.values(EnumSceneView).some((mode) => mode === value);

const isViewObject = (value: unknown): value is IViewSettings =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveTransition = (transition: TSceneTransition | undefined): IResolvedTransition => {
  if (transition === undefined) {
    return CUT_TRANSITION;
  }

  if (!isTransitionType(transition.type)) {
    return failRange('transition.type', Object.values(EnumTransitionType).join(' or '), transition.type);
  }

  if (transition.type === EnumTransitionType.Cut) {
    return CUT_TRANSITION;
  }

  const isMove = transition.type === EnumTransitionType.Move;
  const durationMs = transition.durationMs ?? (isMove ? DEFAULT_MOVE_DURATION_MS : DEFAULT_BLEND_DURATION_MS);

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    failRange('transition.durationMs', 'a finite number >= 0', durationMs);
  }

  const easing = resolveEasing(transition.easing ?? (isMove ? DEFAULT_MOVE_EASING : DEFAULT_BLEND_EASING));
  const move = isMove ? resolveMove(transition) : null;

  return durationMs === 0 ? CUT_TRANSITION : { type: transition.type, durationMs, easing, move };
};

const copyViewSettings = ({ yaw, pitch, roll, fov, fovMode }: IViewSettings): IViewSettings => ({
  yaw,
  pitch,
  roll,
  fov,
  fovMode,
});

const resolveView = (
  view: unknown,
  fallback: TSceneView = EnumSceneView.Scene,
): TSceneView | IViewSettings => {
  if (view === undefined) {
    return fallback;
  }

  if (isSceneView(view)) {
    return view;
  }

  if (!isViewObject(view)) {
    return failRange('view', `${Object.values(EnumSceneView).join(' or ')} or a view object`, view);
  }

  const settings = copyViewSettings(view);

  applyViewSettings(LIBRARY_DEFAULT_VIEW, settings);

  return settings;
};

/**
 * Опции смены сцены с умолчаниями: мгновенная смена, `blend` — 500 мс `sine-in-out`, `move` — 500 мс
 * `quad-out` с размытием 0.5; вид сцены, а у шага — `keep`; без сохранения инерции. Неверные значения —
 * ошибки программиста хоста, поэтому `RangeError` сразу, ещё до изменения снимка и сетевых запросов.
 */
export const resolveShowSceneOptions = (
  options: IShowSceneOptions | undefined,
): IResolvedShowSceneOptions => {
  const transition = resolveTransition(options?.transition);
  const viewFallback = transition.move === null ? EnumSceneView.Scene : EnumSceneView.Keep;

  return {
    transition,
    view: resolveView(options?.view, viewFallback),
    keepMotion: options?.keepMotion === true,
  };
};

/**
 * Опции предзагрузки с умолчанием: вид сцены. Неверный `view` — `RangeError` сразу, как у `showScene`.
 */
export const resolvePreloadSceneView = (
  options: IPreloadSceneOptions | undefined,
): TSceneView | IViewSettings => resolveView(options?.view);

/**
 * Вид в момент появления новой сцены: `keep` — текущий вид камеры с `yaw`, сдвинутым на доворот (тогда
 * направление в мире то же; ограничения новой сцены применит камера), `scene` — стартовый вид сцены,
 * объект — его поля поверх стартового вида.
 */
export const resolveViewAfterSwitch = (
  view: TSceneView | IViewSettings,
  currentView: IView,
  sceneStartView: IView,
  turnDegrees = 0,
): IView => {
  if (view === EnumSceneView.Keep) {
    return { ...currentView, yaw: currentView.yaw + turnDegrees };
  }

  if (view === EnumSceneView.Scene) {
    return sceneStartView;
  }

  return applyViewSettings(sceneStartView, view);
};

/**
 * Доворот новой сцены в градусах: явный `turn` шага, иначе разность `heading` сцены на экране и новой (без
 * сцены на экране — 0). У вариантов ремонта одной комнаты `heading` одинаковый, и доворота нет.
 */
export const viewTurnOf = (explicitTurn: number | null, from: IScenePlace | null, to: IScenePlace): number =>
  explicitTurn ?? (from === null ? 0 : from.heading - to.heading);

/**
 * Кадр готовности сцены по правилам `view` у `showScene`: вид считается в момент вызова и дальше не
 * меняется, даже если пользователь повернётся во время загрузки.
 */
export const resolveSceneTarget = (
  tour: ITour,
  scene: IScene,
  view: TSceneView | IViewSettings,
  currentView: IView,
  isPreload: boolean,
  turnDegrees = 0,
): ISceneTarget => ({
  view: resolveViewAfterSwitch(view, currentView, resolveSceneView(tour, scene), turnDegrees),
  limits: resolveSceneLimits(tour, scene),
  isPreload,
});
