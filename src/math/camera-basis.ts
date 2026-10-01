import { clamp } from './angles';
import { type IVector3, addVectors, createVector3, crossProduct, scaleVector, vectorLength } from './vector3';

/**
 * Оси камеры в мире: `right` — вправо по экрану, `up` — вверх по экрану, `forward` — в центр кадра.
 * В шейдер уходят тем же порядком как столбцы матрицы «камера → мир».
 */
export interface ICameraBasis {
  right: IVector3;
  up: IVector3;
  forward: IVector3;
}

/**
 * Направление взгляда по углам в радианах. `yaw` растёт вправо (к +X), `pitch` — вверх (к +Y), при нуле
 * обоих взгляд идёт вдоль +Z — так же раскладывает грани куба скрипт нарезки neometria.
 */
export const directionFromAngles = (yaw: number, pitch: number): IVector3 =>
  createVector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

/**
 * Обратная к `directionFromAngles`. Направление нормализуется внутри, поэтому подходит и точка мира
 * относительно центра панорамы. В зените и надире `yaw` не определён — возвращается то, что даёт
 * `atan2` для вырожденного случая.
 */
export const anglesFromDirection = (direction: IVector3): { yaw: number; pitch: number } => {
  const length = vectorLength(direction);

  return {
    yaw: Math.atan2(direction.x, direction.z),
    pitch: length === 0 ? 0 : Math.asin(clamp(direction.y / length, -1, 1)),
  };
};

/**
 * Положительный `roll` поворачивает камеру против часовой стрелки вокруг линии взгляда, поэтому горизонт
 * на экране наклоняется по часовой — как в спецификации `camera-view`.
 */
export const cameraBasisFromAngles = (yaw: number, pitch: number, roll: number): ICameraBasis => {
  const forward = directionFromAngles(yaw, pitch);
  const levelRight = createVector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const levelUp = crossProduct(forward, levelRight);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);

  return {
    right: addVectors(scaleVector(levelRight, cosRoll), scaleVector(levelUp, sinRoll)),
    up: addVectors(scaleVector(levelUp, cosRoll), scaleVector(levelRight, -sinRoll)),
    forward,
  };
};

export const cameraToWorld = (basis: ICameraBasis, cameraVector: IVector3): IVector3 =>
  addVectors(
    addVectors(scaleVector(basis.right, cameraVector.x), scaleVector(basis.up, cameraVector.y)),
    scaleVector(basis.forward, cameraVector.z),
  );
