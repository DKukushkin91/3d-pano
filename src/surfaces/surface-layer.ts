import { HOTSPOT_ANCHOR_FRACTIONS } from '../hotspots/hotspot-dictionaries';
import type { IHotspotLayer, ILayerHotspot } from '../hotspots/hotspot-layer';
import {
  type IPlaneBasis,
  type IProjectionCamera,
  hotspotPoint,
  planeBasis,
} from '../math/hotspot-placement';
import { surfaceDrawOrder, surfaceQuad } from '../math/surface-geometry';
import type { ISurfaceDrawing } from '../render/surface-pass';
import { uploadSurfaceTexture } from '../render/surface-texture';
import { type IFrameSurfaceEntry, type ISurfaceFrameScenes, surfacesOfFrame } from './surface-frames';
import {
  type ISurfaceMedia,
  type ISurfaceSourceContext,
  surfaceKeyOf,
  surfaceLoadOf,
  surfaceSizeOf,
} from './surface-sources';
import { type ISurfaceSourceHandle, createSurfaceStore } from './surface-store';

/**
 * То, что слой поверхностей берёт у хотспота: место, сцену, якорь, плоскость и поверхность.
 */
export type TSurfaceLayerHotspot = Pick<ILayerHotspot, 'position' | 'scene' | 'anchor' | 'plane' | 'surface'>;

/**
 * Поверхности кадра для текущей и предыдущей сцены, посчитанные для их камер, и признак «нужны ещё кадры»
 * (видео без сообщений о кадрах играет).
 */
export interface ISurfaceFrame {
  current: ISurfaceDrawing[];
  previous: ISurfaceDrawing[];
  isAnimating: boolean;
}

export interface ISurfaceLayer {
  add: (hotspot: TSurfaceLayerHotspot) => ISurfaceLayerEntry;
  frame: (
    scenes: ISurfaceFrameScenes,
    cameras: { current: IProjectionCamera; previous: IProjectionCamera | null },
  ) => ISurfaceFrame;
  dispose: () => void;
}

/**
 * Поверхность хотспота в слое: `update` получает хотспот целиком и признак явного `setSurface` — тогда
 * источник-элемент заливается заново; `remove` делает запись уходящей, и она гаснет вместе со своей сценой.
 */
export interface ISurfaceLayerEntry {
  update: (hotspot: TSurfaceLayerHotspot, isSurfaceSet: boolean) => void;
  remove: () => void;
}

/**
 * Что нужно слою: WebGL для текстур, лимит текстуры и всё для получения источников.
 */
export interface ISurfaceLayerParts extends ISurfaceSourceContext {
  gl: WebGL2RenderingContext;
  maxTextureSize: number;
}

interface ISurfaceRecord extends IFrameSurfaceEntry {
  hotspot: TSurfaceLayerHotspot;
  basis: IPlaneBasis | null;
  key: unknown;
  handle: ISurfaceSourceHandle<ISurfaceMedia, WebGLTexture> | null;
}

/**
 * Слой поверхностей хотспотов. Записи живут рядом с элементами слоя хотспотов: добавляются, меняются и
 * убираются вместе с ними, но убранная запись хотспота сцены остаётся «уходящей», пока её сцена гаснет в
 * переходе. Каждый кадр слой выбирает поверхности текущей и предыдущей сцены, освобождает закончившие,
 * заливает новые кадры видео и считает прямоугольники для камеры каждой сцены.
 */
export const createSurfaceLayer = (parts: ISurfaceLayerParts): ISurfaceLayer => {
  const { gl } = parts;
  const store = createSurfaceStore<ISurfaceMedia, WebGLTexture>({
    upload: (image, previous) => uploadSurfaceTexture(gl, image.media, previous, image.frames === null),
    release: (texture) => {
      gl.deleteTexture(texture);
    },
    sizeOf: surfaceSizeOf,
    maxTextureSize: parts.maxTextureSize,
    onChange: parts.requestFrame,
  });
  const records = new Set<ISurfaceRecord>();

  const setSurface = (record: ISurfaceRecord, isSurfaceSet: boolean): void => {
    const { surface } = record.hotspot;
    const key = surface === null ? null : surfaceKeyOf(surface);

    if (key === record.key) {
      if (isSurfaceSet && typeof surface?.source === 'object') {
        record.handle?.refresh();
      }

      return;
    }

    record.handle?.release();
    record.key = key;
    record.handle = surface === null ? null : store.acquire(key, surfaceLoadOf(surface, parts));
  };

  const setHotspot = (record: ISurfaceRecord, hotspot: TSurfaceLayerHotspot, isSurfaceSet: boolean): void => {
    const { plane } = hotspot;

    record.hotspot = hotspot;
    record.scene = hotspot.scene;
    record.basis =
      plane === null ? null : planeBasis(hotspotPoint(hotspot.position), plane.facing, plane.spin);
    setSurface(record, isSurfaceSet);
    parts.requestFrame();
  };

  const drawingsOf = (drawn: readonly ISurfaceRecord[], camera: IProjectionCamera): ISurfaceDrawing[] => {
    const drawings: ISurfaceDrawing[] = [];

    for (const record of drawn) {
      const stored = record.handle?.current() ?? null;
      const { plane, surface, anchor, position } = record.hotspot;

      if (stored !== null && plane !== null && surface !== null && record.basis !== null) {
        const fractions = HOTSPOT_ANCHOR_FRACTIONS[anchor];
        const placement = {
          position,
          basis: record.basis,
          anchorX: fractions.x,
          anchorY: fractions.y,
          width: surface.width ?? plane.width,
          aspect: stored.size.height / stored.size.width,
        };

        drawings.push({ texture: stored.texture, quad: surfaceQuad(placement, camera.space) });
      }
    }

    return surfaceDrawOrder(drawings);
  };

  const refreshVideos = (drawn: readonly ISurfaceRecord[]): boolean => {
    const seen = new Set<ISurfaceMedia>();
    let isPolling = false;

    for (const record of drawn) {
      const stored = record.handle?.current() ?? null;
      const frames = stored?.image.frames ?? null;

      if (stored !== null && frames !== null && !seen.has(stored.image)) {
        seen.add(stored.image);
        isPolling = isPolling || frames.isPolling();

        if (frames.takeNewFrame()) {
          record.handle?.refresh();
        }
      }
    }

    return isPolling;
  };

  return {
    add: (hotspot) => {
      const record: ISurfaceRecord = {
        hotspot,
        scene: hotspot.scene,
        isLeaving: false,
        basis: null,
        key: null,
        handle: null,
      };

      records.add(record);
      setHotspot(record, hotspot, false);

      return {
        update: (next, isSurfaceSet) => {
          if (!record.isLeaving) {
            setHotspot(record, next, isSurfaceSet);
          }
        },
        remove: () => {
          record.isLeaving = true;
          parts.requestFrame();
        },
      };
    },
    frame: (scenes, cameras) => {
      const sets = surfacesOfFrame([...records], scenes);

      for (const record of sets.finished) {
        record.handle?.release();
        records.delete(record);
      }

      const isAnimating = refreshVideos([...sets.current, ...sets.previous]);

      return {
        current: drawingsOf(sets.current, cameras.current),
        previous: cameras.previous === null ? [] : drawingsOf(sets.previous, cameras.previous),
        isAnimating,
      };
    },
    dispose: () => {
      records.clear();
      store.dispose();
    },
  };
};

/**
 * Слой хотспотов вместе с поверхностями: каждое добавление, изменение и удаление элемента хотспота уходит и
 * в слой поверхностей. Без WebGL слоя поверхностей нет, и хотспоты работают как раньше.
 */
export const withSurfaces = (layer: IHotspotLayer, surfaces: ISurfaceLayer | null): IHotspotLayer => {
  if (surfaces === null) {
    return layer;
  }

  return {
    ...layer,
    add: (hotspot) => {
      const entry = layer.add(hotspot);
      const surfaceEntry = surfaces.add(hotspot);
      let current: TSurfaceLayerHotspot = hotspot;

      return {
        aligner: entry.aligner,
        update: (changes) => {
          entry.update(changes);
          current = { ...current, ...changes };
          surfaceEntry.update(current, 'surface' in changes);
        },
        remove: () => {
          entry.remove();
          surfaceEntry.remove();
        },
      };
    },
  };
};
