import { anglesFromDirection, directionFromAngles } from './camera-basis';
import type { IVector3 } from './vector3';

/**
 * Текстурные координаты эквиректангулярной панорамы: `u` = 0.5 — центральный столбец (`yaw` 0), края —
 * `yaw` ±180; `v` = 0 — верхняя строка (зенит), 1 — нижняя (надир). Шейдер считает так же.
 */
export interface IEquirectPoint {
  u: number;
  v: number;
}

export const equirectFromDirection = (direction: IVector3): IEquirectPoint => {
  const { yaw, pitch } = anglesFromDirection(direction);

  return {
    u: yaw / (2 * Math.PI) + 0.5,
    v: 0.5 - pitch / Math.PI,
  };
};

export const directionFromEquirect = ({ u, v }: IEquirectPoint): IVector3 =>
  directionFromAngles((u - 0.5) * 2 * Math.PI, (0.5 - v) * Math.PI);
