import type { TResolvedControlsOptions } from '../viewer/viewer-types';
import { keyActionFromKey } from './keyboard-motion';

const PRIMARY_MOUSE_BUTTON = 0;

/**
 * Что известно о нажатии указателя: попало ли оно на саму панораму (canvas или пустое место оверлея), а не
 * на элемент хоста, и какой кнопкой.
 */
export interface IPointerDownFacts {
  isOnPanorama: boolean;
  pointerType: string;
  button: number;
}

/**
 * Что известно о нажатии клавиши: в фокусе ли сам корень просмотрщика и зажат ли Ctrl, Cmd или Alt.
 */
export interface IKeyDownFacts {
  key: string;
  isOnRoot: boolean;
  hasModifier: boolean;
}

/**
 * Начинает ли нажатие жест. Только такое нажатие гасит инерцию и прерывает плавный поворот: правая
 * кнопка мыши, нажатия на интерфейс хоста и отключённые перетаскивание и щипок камеру не трогают.
 */
export const isHandledPointerDown = (
  facts: IPointerDownFacts,
  controls: TResolvedControlsOptions,
): boolean => {
  const isSecondaryMouseButton = facts.pointerType === 'mouse' && facts.button !== PRIMARY_MOUSE_BUTTON;

  return facts.isOnPanorama && !isSecondaryMouseButton && (controls.drag || controls.pinch);
};

export const isHandledWheel = (isOnPanorama: boolean, controls: TResolvedControlsOptions): boolean =>
  controls.wheel && isOnPanorama;

export const isHandledKeyDown = (facts: IKeyDownFacts, controls: TResolvedControlsOptions): boolean =>
  controls.keyboard && facts.isOnRoot && !facts.hasModifier && keyActionFromKey(facts.key) !== undefined;
