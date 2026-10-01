import { clamp } from '../math/angles';
import type { IResolvedTransition } from './show-scene-options';

/**
 * Доля новой сцены в кадре смешивания. Результат плавности ограничивается [0, 1]: кривые с перелётом
 * (`back`, `elastic`) не должны делать новую сцену «ярче полной», а старую — отрицательной.
 */
export const transitionWeight = (transition: IResolvedTransition, elapsedMs: number): number => {
  if (transition.durationMs <= 0) {
    return 1;
  }

  const progress = clamp(elapsedMs / transition.durationMs, 0, 1);

  return clamp(transition.easing(progress), 0, 1);
};

export const isTransitionFinished = (transition: IResolvedTransition, elapsedMs: number): boolean =>
  elapsedMs >= transition.durationMs;
