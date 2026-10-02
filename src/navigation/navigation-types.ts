import type { TEasing } from '../math/easing';
import type { IViewSettings } from '../tour/tour-types';
import type { EnumTransitionType, TSceneView } from './navigation-dictionaries';

export interface ICutTransition {
  type: typeof EnumTransitionType.Cut;
}

/**
 * Смешивание: `durationMs` по умолчанию 500, `easing` — `sine-in-out`; `durationMs: 0` равнозначен `cut`.
 */
export interface IBlendTransition {
  type: typeof EnumTransitionType.Blend;
  durationMs?: number;
  easing?: TEasing;
}

export type TSceneTransition = ICutTransition | IBlendTransition;

/**
 * Опции `showScene`. Без `transition` — мгновенная смена; `view` по умолчанию `scene`; `keepMotion`
 * сохраняет инерцию вращения после смены.
 */
export interface IShowSceneOptions {
  transition?: TSceneTransition;
  view?: TSceneView | IViewSettings;
  keepMotion?: boolean;
}

/**
 * Опции `setTour`: те же, что у `showScene`, плюс сцена нового тура, которую показать (иначе
 * `startScene`, иначе первая).
 */
export interface ISetTourOptions extends IShowSceneOptions {
  scene?: string;
}

/**
 * Опции `preloadScene`: `view` — вид, для которого готовится тайловая сцена, по тем же правилам, что у
 * `showScene` (по умолчанию `scene`). Остальным сценам вид не нужен — они готовятся целиком.
 */
export interface IPreloadSceneOptions {
  view?: TSceneView | IViewSettings;
}
