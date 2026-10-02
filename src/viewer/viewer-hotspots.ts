import {
  resolveAddHotspotOptions,
  resolveHotspotAnchor,
  resolveHotspotPlane,
  resolveHotspotPosition,
  resolveHotspotScene,
} from '../hotspots/add-hotspot-options';
import { createHotspotLayer } from '../hotspots/hotspot-layer';
import type { IAddHotspotOptions, IHotspotHandle, TRenderHotspot } from '../hotspots/hotspot-types';
import { type ITourHotspotsHost, createTourHotspots } from '../hotspots/tour-hotspots';
import type { IScene, ITour } from '../tour/tour-types';
import type { ICameraState } from './camera-state';

/**
 * Хотспоты просмотрщика: слой в оверлее, хотспоты тура и хоста.
 */
export interface IViewerHotspots {
  addHotspot: (options: IAddHotspotOptions) => IHotspotHandle;
  showScene: (scene: IScene, tour: ITour) => void;
  setRenderer: (render: TRenderHotspot | null) => void;
  layout: (isViewChanged: boolean) => void;
  dispose: () => void;
}

export interface IViewerHotspotsParts extends Omit<ITourHotspotsHost, 'layer' | 'isInFrame'> {
  overlay: HTMLElement;
  camera: ICameraState;
  requestFrame: () => void;
}

const INERT_HANDLE: IHotspotHandle = Object.freeze({
  setPosition: () => undefined,
  setScene: () => undefined,
  setAnchor: () => undefined,
  setPlane: () => undefined,
  remove: () => undefined,
});

/**
 * Собирает слой и хотспоты тура и выдаёт `addHotspot`. Аргументы `addHotspot` и сеттеров проверяются
 * всегда, даже после `remove` и уничтожения, — ошибка программиста не должна прятаться за гонкой с
 * размонтированием; сами методы в этом случае ничего не делают.
 */
export const createViewerHotspots = (parts: IViewerHotspotsParts): IViewerHotspots => {
  const { overlay, camera } = parts;
  const layer = createHotspotLayer(overlay, parts.requestFrame);
  const tourHotspots = createTourHotspots(overlay.ownerDocument, {
    ...parts,
    layer,
    isInFrame: (position) => camera.project(position)?.isInView === true,
  });
  let isDisposed = false;

  const addHotspot = (options: IAddHotspotOptions): IHotspotHandle => {
    const resolved = resolveAddHotspotOptions(options);

    if (isDisposed) {
      return INERT_HANDLE;
    }

    const entry = layer.add({ ...resolved, id: null });
    let isRemoved = false;
    const isActive = (): boolean => !isRemoved && !isDisposed;

    return {
      setPosition: (position) => {
        const next = resolveHotspotPosition(position);

        if (isActive()) {
          entry.update({ position: next });
        }
      },
      setScene: (scene) => {
        const next = resolveHotspotScene(scene);

        if (isActive()) {
          entry.update({ scene: next });
        }
      },
      setAnchor: (anchor) => {
        const next = resolveHotspotAnchor(anchor);

        if (isActive()) {
          entry.update({ anchor: next });
        }
      },
      setPlane: (plane) => {
        const next = resolveHotspotPlane(plane);

        if (isActive()) {
          entry.update({ plane: next });
        }
      },
      remove: () => {
        if (isActive()) {
          isRemoved = true;
          entry.remove();
        }
      },
    };
  };

  return {
    addHotspot,
    showScene: (scene, tour) => {
      layer.showScene(scene.id);
      tourHotspots.show(scene, tour);
    },
    setRenderer: tourHotspots.setRenderer,
    layout: (isViewChanged) => {
      layer.layout(camera.frameCamera(), camera.getViewport(), isViewChanged);
    },
    dispose: () => {
      isDisposed = true;
      tourHotspots.dispose();
      layer.dispose();
    },
  };
};
