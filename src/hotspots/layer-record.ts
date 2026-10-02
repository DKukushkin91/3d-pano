import {
  type IPlaneBasis,
  type IProjectionCamera,
  hotspotDistance,
  hotspotPoint,
  placeHotspotPlane,
  placePoint,
  planeBasis,
} from '../math/hotspot-placement';
import type { IViewportSize } from '../math/rectilinear';
import type { IVector3 } from '../math/vector3';
import type { TViewTarget } from '../viewer/viewer-types';
import type { IResolvedHotspotPlane } from './add-hotspot-options';
import { HOTSPOT_ANCHOR_FRACTIONS, type THotspotAnchor } from './hotspot-dictionaries';
import type { IPresenceEntry } from './hotspot-presence';

/**
 * Хотспот слоя: элемент и его размещение. `id` — идентификатор хотспота тура для атрибута
 * `data-pano-hotspot`, у хотспотов хоста `null`.
 */
export interface ILayerHotspot {
  element: HTMLElement;
  position: TViewTarget;
  scene: string | null;
  anchor: THotspotAnchor;
  plane: IResolvedHotspotPlane | null;
  id: string | null;
}

export type TLayerChanges = Partial<Pick<ILayerHotspot, 'position' | 'scene' | 'anchor' | 'plane'>>;

/**
 * Хотспот в слое: оба контейнера, геометрия и последнее применённое размещение — чтобы в кадре писать в DOM
 * только изменения.
 */
export interface ILayerRecord extends IPresenceEntry {
  hotspot: ILayerHotspot;
  anchorElement: HTMLDivElement;
  aligner: HTMLDivElement;
  point: IVector3;
  distance: number;
  basis: IPlaneBasis | null;
  size: { width: number; height: number } | null;
  transform: string;
  isVisible: boolean | null;
}

const PERCENT = 100;

export const alignerTransform = (anchor: THotspotAnchor): string => {
  const fractions = HOTSPOT_ANCHOR_FRACTIONS[anchor];

  return `translate(${String(-fractions.x * PERCENT)}%, ${String(-fractions.y * PERCENT)}%)`;
};

export const refreshGeometry = (record: ILayerRecord): void => {
  const { position, plane } = record.hotspot;

  record.scene = record.hotspot.scene;
  record.point = hotspotPoint(position);
  record.distance = hotspotDistance(position);
  record.basis = plane === null ? null : planeBasis(record.point, plane.facing, plane.spin);
};

const setVisible = (record: ILayerRecord, isVisible: boolean): void => {
  if (record.isVisible === isVisible) {
    return;
  }

  record.isVisible = isVisible;
  record.anchorElement.dataset.panoVisible = String(isVisible);
  record.anchorElement.style.opacity = isVisible ? '' : '0';
  record.aligner.style.pointerEvents = isVisible ? 'auto' : 'none';
};

const setTransform = (record: ILayerRecord, transform: string): void => {
  if (record.transform !== transform) {
    record.transform = transform;
    record.anchorElement.style.transform = transform;
  }
};

const placementOf = (
  record: ILayerRecord,
  camera: IProjectionCamera,
  viewport: IViewportSize,
): string | null => {
  const { plane } = record.hotspot;

  if (plane === null || record.basis === null) {
    const point = placePoint(record.hotspot.position, camera, viewport);

    return point === null ? null : `translate3d(${String(point.x)}px, ${String(point.y)}px, 0)`;
  }

  if (record.size === null) {
    return null;
  }

  const anchor = HOTSPOT_ANCHOR_FRACTIONS[record.hotspot.anchor];
  const matrix = placeHotspotPlane(
    record.hotspot.position,
    record.basis,
    { ...record.size, anchorX: anchor.x, anchorY: anchor.y, worldPerPixel: plane.width / record.size.width },
    camera,
    viewport,
  );

  return matrix === null ? null : `matrix3d(${matrix.join(',')})`;
};

/**
 * Ставит хотспот в кадр: позиция, если её можно показать, иначе — невидимый и ненажимаемый хотспот там,
 * где он был.
 */
export const applyPlacement = (
  record: ILayerRecord,
  camera: IProjectionCamera | null,
  viewport: IViewportSize,
): void => {
  const transform = camera === null ? null : placementOf(record, camera, viewport);

  setVisible(record, transform !== null);

  if (transform !== null) {
    setTransform(record, transform);
  }
};

/**
 * Запись хотспота с контейнерами: внешний ставится в точку, внутренний сдвигает элемент по якорю. Пока
 * первая раскладка не прошла, хотспот невидим.
 */
export const createLayerRecord = (
  ownerDocument: Document,
  hotspot: ILayerHotspot,
  order: number,
): ILayerRecord => {
  const anchorElement = ownerDocument.createElement('div');
  const aligner = ownerDocument.createElement('div');

  Object.assign(anchorElement.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' });
  Object.assign(aligner.style, { position: 'absolute', left: '0', top: '0', width: 'max-content' });
  anchorElement.dataset.panoHotspot = hotspot.id ?? '';
  aligner.style.transform = alignerTransform(hotspot.anchor);
  aligner.append(hotspot.element);
  anchorElement.append(aligner);

  const record: ILayerRecord = {
    hotspot: { ...hotspot },
    scene: hotspot.scene,
    order,
    anchorElement,
    aligner,
    point: { x: 0, y: 0, z: 1 },
    distance: 1,
    basis: null,
    size: null,
    transform: '',
    isVisible: null,
  };

  refreshGeometry(record);
  setVisible(record, false);

  return record;
};
