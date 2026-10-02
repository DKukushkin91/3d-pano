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
 * Общие зависимости частей ввода: цель, текущие опции управления, уведомление о смене взаимодействия и
 * сигнал «пользователь начал управлять камерой» — нажатие, колесо или клавиша, которые просмотрщик
 * обрабатывает.
 */
export interface IInputContext {
  target: IInputTarget;
  controls: () => TResolvedControlsOptions;
  onInteractionChange: () => void;
  onUserInput: () => void;
}
