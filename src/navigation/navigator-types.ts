import type { ISceneModel } from '../math/scene-space';
import type { IVector3 } from '../math/vector3';
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
 * Для чего готовится сцена: вид, с которым она появится, ограничения её тура и чья это загрузка — смены
 * или предзагрузки. Тайловая сцена считает по нему кадр готовности; остальные сессии его не читают.
 */
export interface ISceneTarget {
  view: IView;
  limits: IResolvedViewLimits;
  isPreload: boolean;
}

/**
 * То, что навигатору нужно от сессии сцены. `load(target)` разрешается, когда сцена готова для `target`:
 * основное изображение целиком в видеопамяти, а у тайлового куба — подложка и тайлы кадра появления.
 * Вызов во время загрузки не начинает её заново; повторный вызов после ошибки догружает недостающее.
 */
export interface INavigatorSession {
  load: (target: ISceneTarget) => Promise<void>;
  isReadyFor: (target: ISceneTarget) => boolean;
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
 * Пространство сцены в кадре шага: сдвиг камеры от центра сцены и модель «пол + сфера».
 */
export interface ISceneSpace {
  offset: IVector3;
  model: ISceneModel;
}

/**
 * Шаг в кадре: пространство текущей и предыдущей сцены, сила размытия и точка шага в осях предыдущей сцены
 * — к ней направлено радиальное размытие.
 */
export interface INavigatorMove {
  current: ISceneSpace;
  previous: ISceneSpace;
  blurStrength: number;
  target: IVector3;
}

/**
 * Что рисовать в кадре: текущая сцена с живой камерой и, во время смешивания, предыдущая с весом
 * `1 − weight`. `previousView` — замершая камера предыдущей сцены, `null` — живая; живая камера рисует
 * предыдущую сцену с `yaw`, сдвинутым на `previousYawShift` градусов (обратный доворот). `move` — шаг,
 * `null` вне него.
 */
export interface INavigatorFrame<TSession extends INavigatorSession> {
  current: TSession | null;
  previous: TSession | null;
  previousView: IView | null;
  previousYawShift: number;
  weight: number;
  isAnimating: boolean;
  move: INavigatorMove | null;
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
