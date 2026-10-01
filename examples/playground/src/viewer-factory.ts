import { type IPanoViewer, type IPanoViewerOptions, createPanoViewer } from '@dkukushkin/3d-pano';

import { createViewer } from '../../../dist/internal.js';

const readMaxTextureSize = (): number | null => {
  const value = Number(new URLSearchParams(window.location.search).get('maxTextureSize'));

  return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Обычно песочница создаёт просмотрщик публичной фабрикой. С параметром `?maxTextureSize=4096` она берёт
 * служебную фабрику и уменьшает лимит текстуры — так нарезку 8K на тайлы видно на настольной видеокарте.
 */
export const createPlaygroundViewer = (container: HTMLElement, options: IPanoViewerOptions): IPanoViewer => {
  const maxTextureSize = readMaxTextureSize();

  return maxTextureSize === null
    ? createPanoViewer(container, options)
    : createViewer(container, options, { maxTextureSize });
};
