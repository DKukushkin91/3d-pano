import {
  type IVector3,
  addVectors,
  createVector3,
  dotProduct,
  normalizeVector,
  scaleVector,
  subtractVectors,
} from './vector3';

/**
 * Модель пространства сцены: пол на `floorDepth` ниже центра (`null` — пола нет) и сфера радиуса `radius`
 * вокруг центра. Нужна, только когда камера сдвинута: изображение ложится на неё, и сдвиг даёт параллакс.
 */
export interface ISceneModel {
  floorDepth: number | null;
  radius: number;
}

/**
 * Сдвиг и поворот при переходе из одной сцены в другую: `center` — центр новой сцены в координатах старой,
 * `turn` — на сколько радиан у того же направления больше `yaw` в новой сцене.
 */
export interface ISceneTransfer {
  center: IVector3;
  turn: number;
}

/**
 * Сфера модели — три высоты камеры, без высоты — единичная, как у точек сферы хотспотов. Во время шага
 * она не меньше двух длин шага: камера должна оставаться внутри модели с запасом.
 */
export const MODEL_RADIUS_PER_CAMERA_HEIGHT = 3;
export const STEP_LENGTHS_PER_MODEL_RADIUS = 2;

export const ZERO_OFFSET: Readonly<IVector3> = Object.freeze(createVector3(0, 0, 0));

export const sceneModelOf = (cameraHeight: number | null, stepLength = 0): ISceneModel => ({
  floorDepth: cameraHeight,
  radius: Math.max(
    cameraHeight === null ? 1 : MODEL_RADIUS_PER_CAMERA_HEIGHT * cameraHeight,
    STEP_LENGTHS_PER_MODEL_RADIUS * stepLength,
  ),
});

export const isZeroOffset = (offset: IVector3): boolean => offset.x === 0 && offset.y === 0 && offset.z === 0;

/**
 * Точка модели, в которую попадает луч из `origin` (камера внутри сферы) по единичному `direction`: ближнее
 * из пересечений со сферой `|o + t·d| = R` и с полом `y = −floorDepth`.
 */
export const modelHit = (model: ISceneModel, origin: IVector3, direction: IVector3): IVector3 => {
  const along = dotProduct(origin, direction);
  const reach = Math.sqrt(
    Math.max(0, along * along - dotProduct(origin, origin) + model.radius * model.radius),
  );
  const sphereDistance = reach - along;
  const floorDistance =
    model.floorDepth === null || direction.y >= 0
      ? Number.POSITIVE_INFINITY
      : (-model.floorDepth - origin.y) / direction.y;
  const distance = floorDistance > 0 && floorDistance < sphereDistance ? floorDistance : sphereDistance;

  return addVectors(origin, scaleVector(direction, distance));
};

/**
 * Направление выборки панорамы для луча камеры, сдвинутой на `offset` от центра: из центра сцены на точку
 * модели под лучом. Без сдвига — сам луч, ровно как без модели. Шейдеры содержат функцию с тем же именем.
 */
export const sceneDirection = (model: ISceneModel, offset: IVector3, ray: IVector3): IVector3 =>
  isZeroOffset(offset) ? ray : normalizeVector(modelHit(model, offset, ray));

/**
 * Точка модели в направлении из центра сцены — так точка сферы хотспота или шага получает место в
 * пространстве сцены.
 */
export const modelPointInDirection = (model: ISceneModel, direction: IVector3): IVector3 =>
  modelHit(model, ZERO_OFFSET, normalizeVector(direction));

/**
 * Поворот вокруг вертикали, увеличивающий `yaw` вектора на `angle` радиан (`yaw` растёт вправо, к +X).
 */
export const rotateYaw = (vector: IVector3, angle: number): IVector3 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);

  return createVector3(vector.x * cosine + vector.z * sine, vector.y, vector.z * cosine - vector.x * sine);
};

/**
 * Точка старой сцены в координатах новой.
 */
export const toNextScene = (transfer: ISceneTransfer, point: IVector3): IVector3 =>
  rotateYaw(subtractVectors(point, transfer.center), transfer.turn);

/**
 * Пересчёт по местам сцен в мире: центр новой сцены в осях старой (мир поворачивается на −`heading` старой)
 * и доворот — разность `heading`. Углы в радианах.
 */
export const transferBetweenPlaces = (
  from: { position: IVector3; heading: number },
  to: { position: IVector3; heading: number },
): ISceneTransfer => ({
  center: rotateYaw(subtractVectors(to.position, from.position), -from.heading),
  turn: from.heading - to.heading,
});
