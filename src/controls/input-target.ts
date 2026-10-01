import type { ICssSize } from '../dom/size-observer';
import type { IView, IViewSettings } from '../tour/tour-types';
import type { TResolvedControlsOptions } from '../viewer/viewer-types';

/**
 * То, чем управляет ввод: элементы просмотрщика и камера (её изменения проходят через ограничения сцены).
 */
export interface IInputTarget {
  root: HTMLElement;
  canvas: HTMLElement;
  overlay: HTMLElement;
  getView: () => IView;
  setView: (settings: IViewSettings) => void;
  getViewport: () => ICssSize;
  requestFrame: () => void;
}

/**
 * Общие зависимости частей ввода: цель, текущие опции управления и уведомление о смене взаимодействия.
 */
export interface IInputContext {
  target: IInputTarget;
  controls: () => TResolvedControlsOptions;
  onInteractionChange: () => void;
}
