import { drawingBufferSize } from '../dom/drawing-buffer-size';
import type { ISceneSessionState, ISceneTarget } from '../navigation/navigator-types';
import { type ISceneNavigator, createSceneNavigator } from '../navigation/scene-navigator';
import type { IGlContext } from '../render/gl-context';
import { type TImageLoader, loadImage } from '../resources/load-image';
import type { IResolvedRetryOptions } from '../resources/retry';
import type { IEventEmitter } from '../state/event-emitter';
import type { ISnapshotStore } from '../state/snapshot-store';
import type { ITileFrame } from '../tiles/visible-tiles';
import { isTiledCubeSource } from '../tour/tile-pyramid';
import { EnumSourceType } from '../tour/tour-dictionaries';
import type { IScene, ITour } from '../tour/tour-types';
import { constrainView } from '../view/view-limits';
import type { ICameraState } from './camera-state';
import { type ISceneSession, createSceneSession } from './scene-session';
import type { ITileService } from './tile-service';
import { createTiledSceneSession } from './tiled-scene-session';
import type { IPixelDensity } from './viewer-graphics';
import type { IPanoViewerEventMap } from './viewer-types';

/**
 * Части просмотрщика, которые навигатор двигает при появлении сцены. `onSceneShown` получает объект сцены
 * при её появлении и при замене тура с той же сценой на экране — по нему обновляются хотспоты.
 */
export interface IViewerNavigationParts {
  glContext: IGlContext | null;
  tiles: ITileService | null;
  camera: ICameraState;
  pixelDensity: () => IPixelDensity;
  handleSceneChange: (keepMotion: boolean) => void;
  onSceneShown: (scene: IScene, tour: ITour) => void;
  requestFrame: () => void;
  readLoading: () => { loader: TImageLoader | null; retry: IResolvedRetryOptions };
  store: ISnapshotStore;
  emitter: IEventEmitter<IPanoViewerEventMap>;
  cacheMegabytes: number;
}

const tileFrameOf = (
  parts: IViewerNavigationParts,
  target: ISceneTarget,
  pixelsPerRadian: number,
): ITileFrame | null => {
  const viewport = parts.camera.getViewport();

  if (viewport.width <= 0 || viewport.height <= 0) {
    return null;
  }

  const view = constrainView(target.view, {
    limits: target.limits,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    sourcePixelsPerRadian: pixelsPerRadian,
    previousFov: null,
  });
  const frameCamera = parts.camera.frameCameraOf(view);

  return frameCamera === null
    ? null
    : {
        ...frameCamera,
        buffer: drawingBufferSize({
          cssWidth: viewport.width,
          cssHeight: viewport.height,
          ...parts.pixelDensity(),
        }),
      };
};

const createSession = (
  parts: IViewerNavigationParts,
  glContext: IGlContext,
  scene: IScene,
  withPreview: boolean,
  onChange: (state: ISceneSessionState) => void,
): ISceneSession => {
  const sessionLoadImage = (url: string, signal: AbortSignal): Promise<ImageBitmap> =>
    loadImage(url, { ...parts.readLoading(), signal });
  const { source } = scene;

  if (parts.tiles !== null && source.type === EnumSourceType.Cube && isTiledCubeSource(source)) {
    return createTiledSceneSession({
      scene,
      source,
      withPreview,
      glContext,
      tiles: parts.tiles,
      loadImage: sessionLoadImage,
      frameOf: (target, pixelsPerRadian) => tileFrameOf(parts, target, pixelsPerRadian),
      onChange,
    });
  }

  return createSceneSession({ scene, withPreview, glContext, loadImage: sessionLoadImage, onChange });
};

/**
 * Навигатор сцен просмотрщика: сессии на WebGL-контексте (тайловая — для куба с `levels`), загрузка через
 * загрузчик и повторы из текущих опций, камера, ввод и поворот при появлении сцены. Кадр готовности
 * тайловой сцены — вид появления, проведённый через ограничения её тура и плотность самого подробного
 * уровня, при текущем размере контейнера и плотности буфера. Без WebGL2 навигатора нет — показывать нечего.
 */
export const createViewerNavigator = (
  parts: IViewerNavigationParts,
): ISceneNavigator<ISceneSession> | null => {
  const { glContext, camera, requestFrame } = parts;

  if (glContext === null) {
    return null;
  }

  return createSceneNavigator<ISceneSession>(
    {
      createSession: (scene, withPreview, onChange) =>
        createSession(parts, glContext, scene, withPreview, onChange),
      getView: camera.getView,
      present: ({ tour, scene, view, limits, pixelsPerRadian, keepMotion }) => {
        camera.resetScene(view, limits);
        camera.setSourceDensity(pixelsPerRadian);
        parts.handleSceneChange(keepMotion);
        parts.onSceneShown(scene, tour);
        requestFrame();
      },
      refreshScene: ({ tour, scene, limits }) => {
        camera.setLimits(limits);
        parts.onSceneShown(scene, tour);
        requestFrame();
      },
      setSourceDensity: camera.setSourceDensity,
      requestFrame,
      store: parts.store,
      emitter: parts.emitter,
    },
    parts.cacheMegabytes,
  );
};
