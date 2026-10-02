import { VIEW_TARGET_REQUIREMENT, parseViewTarget } from '../viewer/view-target';
import type { TViewTarget } from '../viewer/viewer-types';
import type { IMoveTransition } from './navigation-types';

/**
 * Опции шага с умолчаниями: точка (`null` — выбирается в момент появления), доворот в градусах (`null` —
 * по `heading` сцен) и сила размытия.
 */
export interface IResolvedMove {
  point: TViewTarget | null;
  turn: number | null;
  blur: number;
}

export const DEFAULT_MOVE_DURATION_MS = 500;
export const DEFAULT_MOVE_BLUR = 0.5;

const failRange = (name: string, requirement: string, value: unknown): never => {
  throw new RangeError(`3d-pano: option "${name}" must be ${requirement}, got ${String(value)}`);
};

const resolvePoint = (value: unknown): TViewTarget | null => {
  if (value === undefined) {
    return null;
  }

  return (
    parseViewTarget(value) ?? failRange('transition.point', VIEW_TARGET_REQUIREMENT, JSON.stringify(value))
  );
};

const resolveTurn = (value: unknown): number | null => {
  if (value === undefined) {
    return null;
  }

  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : failRange('transition.turn', 'a finite number of degrees', value);
};

const resolveBlur = (value: unknown): number => {
  if (value === undefined) {
    return DEFAULT_MOVE_BLUR;
  }

  return typeof value === 'number' && value >= 0 && value <= 1
    ? value
    : failRange('transition.blur', 'a number from 0 to 1', value);
};

/**
 * Точка, доворот и размытие шага. Неверные значения — ошибки программиста: `RangeError` сразу, как у
 * остальных опций смены сцены.
 */
export const resolveMove = (transition: IMoveTransition): IResolvedMove => ({
  point: resolvePoint(transition.point),
  turn: resolveTurn(transition.turn),
  blur: resolveBlur(transition.blur),
});
