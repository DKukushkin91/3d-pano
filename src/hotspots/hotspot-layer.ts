import type { IProjectionCamera } from '../math/hotspot-placement';
import type { IViewportSize } from '../math/rectilinear';
import { isShownInScene, stackingOrder } from './hotspot-presence';
import {
  type ILayerHotspot,
  type ILayerRecord,
  type TLayerChanges,
  alignerTransform,
  applyPlacement,
  createLayerRecord,
  refreshGeometry,
} from './layer-record';

export type { ILayerHotspot, TLayerChanges } from './layer-record';

/**
 * Хотспот в слое: `aligner` — контейнер вокруг элемента, на котором висят слушатели событий.
 */
export interface ILayerEntry {
  aligner: HTMLElement;
  update: (changes: TLayerChanges) => void;
  remove: () => void;
}

export interface IHotspotLayer {
  add: (hotspot: ILayerHotspot) => ILayerEntry;
  showScene: (sceneId: string | null) => void;
  layout: (camera: IProjectionCamera | null, viewport: IViewportSize, isViewChanged: boolean) => void;
  dispose: () => void;
}

const FILL_PARENT = { position: 'absolute', top: '0', right: '0', bottom: '0', left: '0' } as const;

/**
 * Слой хотспотов — первый ребёнок оверлея, под интерфейсом хоста. Каждый элемент обёрнут двумя
 * контейнерами библиотеки: внешний ставится в точку (`translate3d` или `matrix3d` для плоскости), внутренний
 * сдвигает элемент по якорю процентами. Стили и атрибуты элемента хоста не трогаются. Хотспоты чужих сцен
 * сняты со страницы; хотспот позади камеры остаётся в DOM и в порядке Tab, но не виден и не нажимается.
 * Раскладка пересчитывается только в кадрах, где изменились вид, набор хотспотов или размер элемента
 * плоскости; размеры читает `ResizeObserver`, а не кадр.
 */
export const createHotspotLayer = (overlay: HTMLElement, requestFrame: () => void): IHotspotLayer => {
  const { ownerDocument } = overlay;
  const layerElement = ownerDocument.createElement('div');
  const records = new Set<ILayerRecord>();
  const recordByAligner = new Map<Element, ILayerRecord>();
  let shownInOrder: ILayerRecord[] = [];
  let sceneId: string | null = null;
  let isDirty = true;
  let isOrderDirty = true;
  let nextOrder = 0;

  Object.assign(layerElement.style, { ...FILL_PARENT, pointerEvents: 'none' });
  overlay.prepend(layerElement);

  const markDirty = (): void => {
    isDirty = true;
    requestFrame();
  };

  const markOrderDirty = (): void => {
    isOrderDirty = true;
    markDirty();
  };

  const resizeObserver =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const record = recordByAligner.get(entry.target);

            if (record !== undefined) {
              record.size = { width: entry.contentRect.width, height: entry.contentRect.height };
            }
          }

          markDirty();
        });

  const syncAttachment = (record: ILayerRecord): void => {
    const isShown = records.has(record) && isShownInScene(record, sceneId);

    if (isShown && record.anchorElement.parentElement !== layerElement) {
      layerElement.append(record.anchorElement);
    } else if (!isShown) {
      record.anchorElement.remove();
    }
  };

  const syncObservation = (record: ILayerRecord): void => {
    if (record.hotspot.plane !== null && records.has(record)) {
      resizeObserver?.observe(record.aligner);
    } else {
      resizeObserver?.unobserve(record.aligner);
      record.size = null;
    }
  };

  const add = (hotspot: ILayerHotspot): ILayerEntry => {
    const record = createLayerRecord(ownerDocument, hotspot, nextOrder);

    nextOrder += 1;

    records.add(record);
    recordByAligner.set(record.aligner, record);
    syncAttachment(record);
    syncObservation(record);
    markOrderDirty();

    return {
      aligner: record.aligner,
      update: (changes) => {
        record.hotspot = { ...record.hotspot, ...changes };
        refreshGeometry(record);
        record.aligner.style.transform = alignerTransform(record.hotspot.anchor);
        syncAttachment(record);
        syncObservation(record);
        markOrderDirty();
      },
      remove: () => {
        records.delete(record);
        recordByAligner.delete(record.aligner);
        syncAttachment(record);
        syncObservation(record);
        markOrderDirty();
      },
    };
  };

  const reorder = (): void => {
    shownInOrder = stackingOrder([...records].filter((record) => isShownInScene(record, sceneId)));
    shownInOrder.forEach((record, index) => {
      record.anchorElement.style.zIndex = String(index + 1);
    });
    isOrderDirty = false;
  };

  const layout = (
    camera: IProjectionCamera | null,
    viewport: IViewportSize,
    isViewChanged: boolean,
  ): void => {
    if (!isDirty && !isViewChanged) {
      return;
    }

    isDirty = false;

    if (isOrderDirty) {
      reorder();
    }

    for (const record of shownInOrder) {
      applyPlacement(record, camera, viewport);
    }
  };

  return {
    add,
    showScene: (nextSceneId) => {
      sceneId = nextSceneId;

      for (const record of records) {
        syncAttachment(record);
      }

      markOrderDirty();
    },
    layout,
    dispose: () => {
      resizeObserver?.disconnect();
      records.clear();
      recordByAligner.clear();
      shownInOrder = [];
      layerElement.remove();
    },
  };
};
