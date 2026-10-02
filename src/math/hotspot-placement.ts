import type { ISpherePoint, TViewTarget } from '../viewer/viewer-types';
import { toRadians } from './angles';
import { type ICameraBasis, directionFromAngles } from './camera-basis';
import type { IHalfTangents } from './field-of-view';
import { type IViewportSize, screenFromDirection } from './rectilinear';
import {
  type IVector3,
  addVectors,
  createVector3,
  crossProduct,
  dotProduct,
  normalizeVector,
  scaleVector,
  vectorLength,
} from './vector3';

/**
 * Камера кадра в том виде, в каком её знает проекция: оси и половины углов обзора.
 */
export interface IProjectionCamera {
  basis: ICameraBasis;
  halfTangents: IHalfTangents;
}

/**
 * Плоскость хотспота: `normal` — куда смотрит лицевая сторона, `up` и `right` — верх и правый край
 * элемента так, как их видит смотрящий на лицевую сторону.
 */
export interface IPlaneBasis {
  right: IVector3;
  up: IVector3;
  normal: IVector3;
}

/**
 * Элемент в плоскости: его CSS-размер, доли якоря (0 — левый или верхний край, 1 — правый или нижний) и
 * единиц мира на CSS-пиксель.
 */
export interface IPlaneElement {
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  worldPerPixel: number;
}

const WORLD_UP = createVector3(0, 1, 0);
const MIN_IN_PLANE_LENGTH = 1e-6;
const MIN_FORWARD_DISTANCE = 1e-6;

const isSpherePoint = (position: TViewTarget): position is ISpherePoint => 'yaw' in position;

/**
 * Точка мира хотспота: точка мира — как есть, точка сферы — на расстоянии 1 от центра панорамы.
 */
export const hotspotPoint = (position: TViewTarget): IVector3 =>
  isSpherePoint(position)
    ? directionFromAngles(toRadians(position.yaw), toRadians(position.pitch))
    : createVector3(position.x, position.y, position.z);

/**
 * Расстояние от камеры для порядка наложения: камера стоит в центре панорамы, у точки сферы оно равно 1.
 */
export const hotspotDistance = (position: TViewTarget): number => vectorLength(hotspotPoint(position));

const projectOntoPlane = (vector: IVector3, normal: IVector3): IVector3 =>
  addVectors(vector, scaleVector(normal, -dotProduct(vector, normal)));

const horizontalDirection = (yawDegrees: number): IVector3 =>
  createVector3(Math.sin(toRadians(yawDegrees)), 0, Math.cos(toRadians(yawDegrees)));

const unspunUp = (point: IVector3, normal: IVector3, facingYaw: number): IVector3 => {
  const alongPlane = projectOntoPlane(WORLD_UP, normal);

  if (vectorLength(alongPlane) > MIN_IN_PLANE_LENGTH) {
    return normalizeVector(alongPlane);
  }

  const awayFromCenter = projectOntoPlane(createVector3(point.x, 0, point.z), normal);

  return vectorLength(awayFromCenter) > MIN_IN_PLANE_LENGTH
    ? normalizeVector(awayFromCenter)
    : horizontalDirection(facingYaw);
};

/**
 * Оси плоскости. Лицевая сторона смотрит в `facing`, а без него — в центр панорамы. Верх элемента — вверх
 * по плоскости (проекция мировой вертикали); у горизонтальной плоскости — от центра панорамы, чтобы
 * надпись на полу читалась с места камеры, а точно под или над камерой — в сторону `facing.yaw`. `spin`
 * поворачивает элемент по часовой стрелке при взгляде на лицевую сторону.
 */
export const planeBasis = (
  point: IVector3,
  facing: ISpherePoint | undefined,
  spinDegrees: number,
): IPlaneBasis => {
  const normal =
    facing === undefined
      ? normalizeVector(scaleVector(point, -1))
      : directionFromAngles(toRadians(facing.yaw), toRadians(facing.pitch));
  const up = unspunUp(point, normal, facing?.yaw ?? 0);
  const right = crossProduct(normal, up);
  const spin = toRadians(spinDegrees);
  const spunUp = addVectors(scaleVector(up, Math.cos(spin)), scaleVector(right, Math.sin(spin)));

  return { right: crossProduct(normal, spunUp), up: spunUp, normal };
};

/**
 * Экранная точка хотспота без плоскости в CSS-пикселях контейнера; `null` — точка позади камеры.
 */
export const placePoint = (
  position: TViewTarget,
  camera: IProjectionCamera,
  viewport: IViewportSize,
): { x: number; y: number; isInView: boolean } | null =>
  screenFromDirection(hotspotPoint(position), viewport, camera.basis, camera.halfTangents);

interface ILinearForm {
  along: number;
  across: number;
  offset: number;
}

const linearForm = (
  axis: IVector3,
  point: IVector3,
  basis: IPlaneBasis,
  worldPerPixel: number,
): ILinearForm => ({
  along: worldPerPixel * dotProduct(axis, basis.right),
  across: -worldPerPixel * dotProduct(axis, basis.up),
  offset: dotProduct(axis, point),
});

const combine = (
  first: ILinearForm,
  firstFactor: number,
  second: ILinearForm,
  secondFactor: number,
): ILinearForm => ({
  along: first.along * firstFactor + second.along * secondFactor,
  across: first.across * firstFactor + second.across * secondFactor,
  offset: first.offset * firstFactor + second.offset * secondFactor,
});

const valueAt = (form: ILinearForm, alongPixel: number, acrossPixel: number): number =>
  form.along * alongPixel + form.across * acrossPixel + form.offset;

const cornersOf = (element: IPlaneElement): readonly (readonly [number, number])[] => {
  const left = -element.anchorX * element.width;
  const top = -element.anchorY * element.height;

  return [
    [left, top],
    [left + element.width, top],
    [left, top + element.height],
    [left + element.width, top + element.height],
  ];
};

/**
 * `matrix3d` для элемента в плоскости, `null` — элемент нельзя показать: хоть один угол позади камеры или
 * размер ещё неизвестен. Пиксель элемента `(u, v)` (от точки якоря, `v` вниз) лежит в мире в точке
 * `P + s·(u·R − v·U)`. В осях камеры координаты линейны по `(u, v, 1)`, а экранные `X·zc` и `Y·zc` —
 * тоже, поэтому отображение «пиксель элемента → экран» однородное и записывается одной матрицей:
 * столбцы для `u`, `v`, `z` и `1`, строки `X·zc`, `Y·zc`, `z`, `zc` (CSS делит на последнюю).
 */
export const placePlane = (
  point: IVector3,
  basis: IPlaneBasis,
  element: IPlaneElement,
  camera: IProjectionCamera,
  viewport: IViewportSize,
): number[] | null => {
  if (element.width <= 0 || element.height <= 0) {
    return null;
  }

  const xForm = linearForm(camera.basis.right, point, basis, element.worldPerPixel);
  const yForm = linearForm(camera.basis.up, point, basis, element.worldPerPixel);
  const zForm = linearForm(camera.basis.forward, point, basis, element.worldPerPixel);

  if (
    cornersOf(element).some(
      ([alongPixel, acrossPixel]) => valueAt(zForm, alongPixel, acrossPixel) <= MIN_FORWARD_DISTANCE,
    )
  ) {
    return null;
  }

  const screenX = combine(zForm, viewport.width / 2, xForm, viewport.width / (2 * camera.halfTangents.width));
  const screenY = combine(
    zForm,
    viewport.height / 2,
    yForm,
    -viewport.height / (2 * camera.halfTangents.height),
  );
  return [
    screenX.along,
    screenY.along,
    0,
    zForm.along,
    screenX.across,
    screenY.across,
    0,
    zForm.across,
    0,
    0,
    1,
    0,
    screenX.offset,
    screenY.offset,
    0,
    zForm.offset,
  ];
};
