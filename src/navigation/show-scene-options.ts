import { EnumEasing, type TEasingFunction, resolveEasing } from '../math/easing';
import { LIBRARY_DEFAULT_VIEW, resolveSceneLimits, resolveSceneView } from '../tour/tour-defaults';
import type { IScene, ITour, IView, IViewSettings } from '../tour/tour-types';
import { applyViewSettings } from '../viewer/camera-state';
import {
  EnumSceneView,
  EnumTransitionType,
  type TSceneView,
  type TTransitionType,
} from './navigation-dictionaries';
import type { IShowSceneOptions, TSceneTransition } from './navigation-types';
import type { ISceneTarget } from './navigator-types';

/**
 * Переход с подставленными умолчаниями. Мгновенная смена — это переход длительностью 0.
 */
export interface IResolvedTransition {
  type: TTransitionType;
  durationMs: number;
  easing: TEasingFunction;
}

export interface IResolvedShowSceneOptions {
  transition: IResolvedTransition;
  view: TSceneView | IViewSettings;
  keepMotion: boolean;
}

export const DEFAULT_BLEND_DURATION_MS = 500;
export const DEFAULT_BLEND_EASING: typeof EnumEasing.SineInOut = EnumEasing.SineInOut;

const CUT_TRANSITION: Readonly<IResolvedTransition> = Object.freeze({
  type: EnumTransitionType.Cut,
  durationMs: 0,
  easing: resolveEasing(EnumEasing.Linear),
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

  const durationMs = transition.durationMs ?? DEFAULT_BLEND_DURATION_MS;

  if (!Number.isFinite(durationMs) || durationMs < 0) {
    failRange('transition.durationMs', 'a finite number >= 0', durationMs);
  }

  const easing = resolveEasing(transition.easing ?? DEFAULT_BLEND_EASING);

  return durationMs === 0 ? CUT_TRANSITION : { type: EnumTransitionType.Blend, durationMs, easing };
};

const copyViewSettings = ({ yaw, pitch, roll, fov, fovMode }: IViewSettings): IViewSettings => ({
  yaw,
  pitch,
  roll,
  fov,
  fovMode,
});

const resolveView = (view: unknown): TSceneView | IViewSettings => {
  if (view === undefined) {
    return EnumSceneView.Scene;
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
 * Опции смены сцены с умолчаниями: мгновенная смена, `blend` — 500 мс `sine-in-out`, вид сцены, без
 * сохранения инерции. Неверные значения — ошибки программиста хоста, поэтому `RangeError` сразу, ещё до
 * изменения снимка и сетевых запросов.
 */
export const resolveShowSceneOptions = (
  options: IShowSceneOptions | undefined,
): IResolvedShowSceneOptions => ({
  transition: resolveTransition(options?.transition),
  view: resolveView(options?.view),
  keepMotion: options?.keepMotion === true,
});

/**
 * Вид в момент появления новой сцены: `keep` — текущий вид камеры (его проведут через ограничения новой
 * сцены), `scene` — стартовый вид сцены, объект — его поля поверх стартового вида.
 */
export const resolveViewAfterSwitch = (
  view: TSceneView | IViewSettings,
  currentView: IView,
  sceneStartView: IView,
): IView => {
  if (view === EnumSceneView.Keep) {
    return currentView;
  }

  if (view === EnumSceneView.Scene) {
    return sceneStartView;
  }

  return applyViewSettings(sceneStartView, view);
};

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
): ISceneTarget => ({
  view: resolveViewAfterSwitch(view, currentView, resolveSceneView(tour, scene)),
  limits: resolveSceneLimits(tour, scene),
  isPreload,
});
