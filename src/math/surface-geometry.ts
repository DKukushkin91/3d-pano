import type { TViewTarget } from '../viewer/viewer-types';
import { type IPlaneBasis, anchorFromCamera } from './hotspot-placement';
import type { ISceneSpace } from './scene-space';
import { type IVector3, addVectors, scaleVector, vectorLength } from './vector3';

/**
 * Ближняя плоскость прохода поверхностей в единицах мира: ближе камера не рисует, а дальняя плоскость
 * бесконечна, поэтому глубина зависит только от расстояния вдоль взгляда.
 */
export const SURFACE_NEAR_PLANE = 0.01;

/**
 * Где лежит поверхность хотспота: его точка и оси плоскости, доли якоря (0 — левый или верхний край,
 * 1 — правый или нижний), ширина в единицах мира и отношение высоты источника к ширине.
 */
export interface ISurfacePlacement {
  position: TViewTarget;
  basis: IPlaneBasis;
  anchorX: number;
  anchorY: number;
  width: number;
  aspect: number;
}

/**
 * Прямоугольник поверхности относительно камеры: верхний левый угол источника `origin` и рёбра `across`
 * (к правому краю) и `down` (к нижнему). `distance` — расстояние от камеры до точки хотспота, по нему
 * поверхности сортируются.
 */
export interface ISurfaceQuad {
  origin: IVector3;
  across: IVector3;
  down: IVector3;
  distance: number;
}

/**
 * Прямоугольник поверхности в кадре. Пиксель источника `(u, v)` (доли ширины и высоты от верхнего левого
 * угла) лежит в точке `O + u·A + v·B` — так же, как пиксель элемента хотспота в `placePlane`: от точки
 * хотспота вправо по `right` и вниз против `up`, с якорем в своих долях. Точка и масштаб берутся из
 * `anchorFromCamera`, поэтому при шаге поверхность едет вместе с элементом, а у точки сферы растягивается
 * на расстояние до модели.
 */
export const surfaceQuad = (placement: ISurfacePlacement, space: ISceneSpace | undefined): ISurfaceQuad => {
  const anchor = anchorFromCamera(placement.position, space);
  const width = placement.width * anchor.scale;
  const across = scaleVector(placement.basis.right, width);
  const down = scaleVector(placement.basis.up, -width * placement.aspect);
  const origin = addVectors(
    anchor.point,
    addVectors(scaleVector(across, -placement.anchorX), scaleVector(down, -placement.anchorY)),
  );

  return { origin, across, down, distance: vectorLength(anchor.point) };
};

/**
 * Глубина в нормализованных координатах для точки на расстоянии `forwardDistance` вдоль взгляда:
 * перспектива с ближней плоскостью `SURFACE_NEAR_PLANE` и бесконечной дальней, `−1` на ближней плоскости и
 * стремится к `1` вдали. Та же формула стоит в вершинном шейдере поверхности.
 */
export const surfaceDepth = (forwardDistance: number): number =>
  1 - (2 * SURFACE_NEAR_PLANE) / forwardDistance;

/**
 * Порядок отрисовки: от дальних к ближним, чтобы полупрозрачные края ближних смешивались с уже нарисованными
 * дальними. При равных расстояниях порядок сохраняется.
 */
export const surfaceDrawOrder = <TItem extends { quad: ISurfaceQuad }>(items: readonly TItem[]): TItem[] => {
  const ordered = [...items];

  ordered.sort((first, second) => second.quad.distance - first.quad.distance);

  return ordered;
};
