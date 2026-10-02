import type { IShowSceneOptions } from '../navigation/navigation-types';
import type { ISpherePoint, TViewTarget } from '../viewer/viewer-types';
import type { THotspotAnchor } from './hotspot-dictionaries';

/**
 * Хотспот в плоскости мира. `width` — ширина элемента в единицах мира, высота — пропорционально его
 * CSS-размеру. `facing` — куда смотрит лицевая сторона (по умолчанию — в центр панорамы), `spin` —
 * поворот в своей плоскости в градусах. Точка сферы как `position` лежит на расстоянии 1.
 */
export interface IHotspotPlane {
  width: number;
  facing?: ISpherePoint;
  spin?: number;
}

/**
 * Переход по хотспоту: сцена тура и те же опции, что у `showScene`.
 */
export interface IHotspotTarget extends IShowSceneOptions {
  scene: string;
}

/**
 * Хотспот сцены в туре — только данные. `title` выводится текстом и служит доступным именем, `data` —
 * произвольный JSON, который получают `renderHotspot` и события.
 */
export interface IHotspot {
  id: string;
  position: TViewTarget;
  title?: string;
  target?: IHotspotTarget;
  data?: unknown;
  anchor?: THotspotAnchor;
  plane?: IHotspotPlane;
}
