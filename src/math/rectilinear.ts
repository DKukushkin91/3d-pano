import { type ICameraBasis, cameraToWorld } from './camera-basis';
import type { IHalfTangents } from './field-of-view';
import { type IVector3, createVector3, dotProduct, normalizeVector } from './vector3';

/**
 * Размер области отрисовки в CSS-пикселях: `project` и `unproject` работают в координатах контейнера
 * хоста, а не в физических пикселях буфера.
 */
export interface IViewportSize {
  width: number;
  height: number;
}

/**
 * Точка в нормализованных координатах кадра: −1…1 слева направо и снизу вверх, как в WebGL.
 */
export interface INormalizedPoint {
  x: number;
  y: number;
}

export interface IScreenProjection {
  x: number;
  y: number;
  isInView: boolean;
}

const MIN_FORWARD_DISTANCE = 1e-6;

export const normalizedFromScreen = (x: number, y: number, viewport: IViewportSize): INormalizedPoint => ({
  x: (2 * x) / viewport.width - 1,
  y: 1 - (2 * y) / viewport.height,
});

export const screenFromNormalized = (
  point: INormalizedPoint,
  viewport: IViewportSize,
): { x: number; y: number } => ({
  x: ((point.x + 1) / 2) * viewport.width,
  y: ((1 - point.y) / 2) * viewport.height,
});

/**
 * Луч камеры для точки кадра в прямолинейной проекции. Шейдер содержит функцию с тем же именем и той же
 * формулой — экранные координаты хотспотов обязаны совпадать с картинкой.
 */
export const rectilinearRay = (point: INormalizedPoint, halfTangents: IHalfTangents): IVector3 =>
  normalizeVector(createVector3(point.x * halfTangents.width, point.y * halfTangents.height, 1));

/**
 * Направление в мире, изображённое в пикселе контейнера.
 */
export const directionFromScreen = (
  x: number,
  y: number,
  viewport: IViewportSize,
  basis: ICameraBasis,
  halfTangents: IHalfTangents,
): IVector3 =>
  normalizeVector(cameraToWorld(basis, rectilinearRay(normalizedFromScreen(x, y, viewport), halfTangents)));

/**
 * Пиксель контейнера, в котором изображено направление; `null`, если направление позади камеры или лежит
 * в её плоскости. Точки перед камерой за краем кадра возвращаются с `isInView: false` — хосту это нужно,
 * чтобы показать стрелку «объект слева».
 */
export const screenFromDirection = (
  direction: IVector3,
  viewport: IViewportSize,
  basis: ICameraBasis,
  halfTangents: IHalfTangents,
): IScreenProjection | null => {
  const forwardDistance = dotProduct(direction, basis.forward);

  if (forwardDistance <= MIN_FORWARD_DISTANCE) {
    return null;
  }

  const normalizedPoint = {
    x: dotProduct(direction, basis.right) / forwardDistance / halfTangents.width,
    y: dotProduct(direction, basis.up) / forwardDistance / halfTangents.height,
  };
  const screenPoint = screenFromNormalized(normalizedPoint, viewport);

  return {
    ...screenPoint,
    isInView:
      screenPoint.x >= 0 &&
      screenPoint.x <= viewport.width &&
      screenPoint.y >= 0 &&
      screenPoint.y <= viewport.height,
  };
};
