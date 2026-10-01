import type { TImageLoader } from '../resources/load-image';
import type { IRetryOptions } from '../resources/retry';
import type { IPanoError, IPanoViewerSnapshot } from '../state/viewer-state-types';
import type { ITour, IView, IViewSettings } from '../tour/tour-types';

/**
 * Способы управления камерой. Булевы флаги по умолчанию `true`; множители скорости и трения — 1.
 */
export interface IControlsOptions {
  drag?: boolean;
  wheel?: boolean;
  pinch?: boolean;
  keyboard?: boolean;
  inertia?: boolean;
  wheelSpeed?: number;
  keyboardSpeed?: number;
  inertiaFriction?: number;
  invertDrag?: boolean;
}

export type TResolvedControlsOptions = Required<IControlsOptions>;

/**
 * Опции `createPanoViewer`. `label` обязателен: без доступного имени просмотрщик недоступен скринридерам.
 */
export interface IPanoViewerOptions {
  tour: ITour;
  label: string;
  loader?: TImageLoader;
  retry?: IRetryOptions;
  controls?: IControlsOptions;
  maxPixelRatio?: number;
  renderScale?: number;
  sceneCacheMegabytes?: number;
}

/**
 * То, что можно поменять у работающего просмотрщика. Ключ со значением `undefined` возвращает опцию к
 * умолчанию; объекты `controls` и `retry` заменяются целиком, недостающие поля берут умолчания.
 */
export type TPanoViewerUpdate = Partial<Omit<IPanoViewerOptions, 'tour'>>;

export interface ISpherePoint {
  yaw: number;
  pitch: number;
}

/**
 * Направление из центра панорамы в мировых осях: X — вправо, Y — вверх, Z — вперёд. Длина не важна,
 * поэтому подходит и точка мира относительно центра панорамы.
 */
export interface IDirection {
  x: number;
  y: number;
  z: number;
}

/**
 * Точка в CSS-пикселях относительно левого верхнего угла контейнера; `isInView` — попадает ли она в
 * контейнер.
 */
export interface IProjectedPoint {
  x: number;
  y: number;
  isInView: boolean;
}

/**
 * События просмотрщика. `sceneChange` приходит, когда меняется `snapshot.sceneId`: в момент принятой
 * смены (до загрузки новой сцены) и для стартовой сцены с `previousSceneId: null`.
 */
export interface IPanoViewerEventMap {
  sceneLoadStart: { sceneId: string };
  sceneReady: { sceneId: string };
  sceneChange: { sceneId: string; previousSceneId: string | null };
  viewChange: { view: IView };
  error: { error: IPanoError };
}

/**
 * Просмотрщик. Методы — обычные функции без `this`: их можно передавать как колбэки.
 */
export interface IPanoViewer {
  readonly overlay: HTMLElement;
  getView: () => IView;
  setView: (view: IViewSettings) => void;
  project: (point: ISpherePoint | IDirection) => IProjectedPoint | null;
  unproject: (x: number, y: number) => ISpherePoint | null;
  retry: () => Promise<void>;
  update: (options: TPanoViewerUpdate) => void;
  on: <TName extends keyof IPanoViewerEventMap>(
    name: TName,
    handler: (payload: IPanoViewerEventMap[TName]) => void,
  ) => () => void;
  getSnapshot: () => IPanoViewerSnapshot;
  subscribe: (listener: () => void) => () => void;
  destroy: () => void;
}
