import { type ISceneNavigator, createSceneNavigator } from '../navigation/scene-navigator';
import type { IGlContext } from '../render/gl-context';
import { type TImageLoader, loadImage } from '../resources/load-image';
import type { IResolvedRetryOptions } from '../resources/retry';
import type { IEventEmitter } from '../state/event-emitter';
import type { ISnapshotStore } from '../state/snapshot-store';
import type { IScene, ITour } from '../tour/tour-types';
import type { ICameraState } from './camera-state';
import { type ISceneSession, createSceneSession } from './scene-session';
import type { IPanoViewerEventMap } from './viewer-types';

/**
 * Части просмотрщика, которые навигатор двигает при появлении сцены. `onSceneShown` получает объект сцены
 * при её появлении и при замене тура с той же сценой на экране — по нему обновляются хотспоты.
 */
export interface IViewerNavigationParts {
  glContext: IGlContext | null;
  camera: ICameraState;
  handleSceneChange: (keepMotion: boolean) => void;
  onSceneShown: (scene: IScene, tour: ITour) => void;
  requestFrame: () => void;
  readLoading: () => { loader: TImageLoader | null; retry: IResolvedRetryOptions };
  store: ISnapshotStore;
  emitter: IEventEmitter<IPanoViewerEventMap>;
  cacheMegabytes: number;
}

/**
 * Навигатор сцен просмотрщика: сессии на WebGL-контексте, загрузка через загрузчик и повторы из текущих
 * опций, камера, ввод и поворот при появлении сцены. Без WebGL2 навигатора нет — показывать нечего.
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
        createSceneSession({
          scene,
          withPreview,
          glContext,
          loadImage: (url, signal) => loadImage(url, { ...parts.readLoading(), signal }),
          onChange,
        }),
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
