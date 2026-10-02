import type { IEventEmitter } from '../state/event-emitter';
import type { ISnapshotStore } from '../state/snapshot-store';
import type { TViewerStatus } from '../state/viewer-dictionaries';
import type { IResolvedViewLimits, IScene, ITour, IView } from '../tour/tour-types';
import type { IPanoViewerEventMap } from '../viewer/viewer-types';

/**
 * Состояние загрузки сцены, которое сессия сообщает при каждом изменении.
 */
export interface ISceneSessionState {
  status: TViewerStatus;
  loadProgress: number;
  pixelsPerRadian: number | null;
}

/**
 * То, что навигатору нужно от сессии сцены. `load()` разрешается, когда основное изображение целиком в
 * видеопамяти; повторный вызов после ошибки догружает недостающее.
 */
export interface INavigatorSession {
  load: () => Promise<void>;
  byteSize: () => number;
  dispose: () => void;
}

/**
 * Сессия в руках навигатора: ключ по содержимому, последнее состояние и готовность.
 */
export interface ISceneRecord<TSession extends INavigatorSession> {
  key: string;
  session: TSession;
  state: ISceneSessionState;
  isComplete: boolean;
}

/**
 * Сцена в момент появления на экране: тур, в котором она принята к показу, объект сцены из него и камера.
 */
export interface ISceneAppearance {
  tour: ITour;
  scene: IScene;
  view: IView;
  limits: IResolvedViewLimits;
  pixelsPerRadian: number | null;
  keepMotion: boolean;
}

/**
 * Новый тур оставил на экране ту же сцену: новый тур, её объект из него (там могут измениться хотспоты)
 * и новые ограничения.
 */
export interface ISceneRefresh {
  tour: ITour;
  scene: IScene;
  limits: IResolvedViewLimits;
}

/**
 * Что рисовать в кадре: текущая сцена с живой камерой и, во время смешивания, предыдущая с весом
 * `1 − weight`. `previousView` — замершая камера предыдущей сцены, `null` — живая.
 */
export interface INavigatorFrame<TSession extends INavigatorSession> {
  current: TSession | null;
  previous: TSession | null;
  previousView: IView | null;
  weight: number;
  isAnimating: boolean;
}

/**
 * Побочные эффекты навигатора: создание сессий, камера, кадры, снимок и события.
 */
export interface ISceneNavigatorHost<TSession extends INavigatorSession> {
  createSession: (
    scene: IScene,
    withPreview: boolean,
    onChange: (state: ISceneSessionState) => void,
  ) => TSession;
  getView: () => IView;
  present: (appearance: ISceneAppearance) => void;
  refreshScene: (refresh: ISceneRefresh) => void;
  setSourceDensity: (pixelsPerRadian: number | null) => void;
  requestFrame: () => void;
  store: ISnapshotStore;
  emitter: IEventEmitter<IPanoViewerEventMap>;
}
