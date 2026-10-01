import type { TResolvedControlsOptions } from '../viewer/viewer-types';

/**
 * `touch-action` корня по включённым жестам: что просмотрщик не обрабатывает сам, остаётся браузеру —
 * без перетаскивания и щипка палец прокручивает и масштабирует страницу как обычно.
 */
export const touchActionFor = (controls: Pick<TResolvedControlsOptions, 'drag' | 'pinch'>): string => {
  if (controls.drag && controls.pinch) {
    return 'none';
  }

  if (controls.drag) {
    return 'pinch-zoom';
  }

  return controls.pinch ? 'pan-x pan-y' : 'auto';
};
