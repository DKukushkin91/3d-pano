import type { TResolvedControlsOptions } from './viewer-types';

/**
 * Все поля `controls` — для сравнения опций по значению.
 */
export const CONTROLS_OPTION_KEYS: readonly (keyof TResolvedControlsOptions)[] = [
  'drag',
  'wheel',
  'pinch',
  'keyboard',
  'inertia',
  'wheelSpeed',
  'keyboardSpeed',
  'inertiaFriction',
  'invertDrag',
];
