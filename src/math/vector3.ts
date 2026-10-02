/**
 * Вектор или направление в мире: X — вправо, Y — вверх, Z — вперёд (туда смотрит камера при
 * `yaw = 0, pitch = 0`).
 */
export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

export const createVector3 = (x: number, y: number, z: number): IVector3 => ({ x, y, z });

export const addVectors = (first: IVector3, second: IVector3): IVector3 =>
  createVector3(first.x + second.x, first.y + second.y, first.z + second.z);

export const subtractVectors = (first: IVector3, second: IVector3): IVector3 =>
  createVector3(first.x - second.x, first.y - second.y, first.z - second.z);

export const scaleVector = (vector: IVector3, factor: number): IVector3 =>
  createVector3(vector.x * factor, vector.y * factor, vector.z * factor);

export const dotProduct = (first: IVector3, second: IVector3): number =>
  first.x * second.x + first.y * second.y + first.z * second.z;

export const crossProduct = (first: IVector3, second: IVector3): IVector3 =>
  createVector3(
    first.y * second.z - first.z * second.y,
    first.z * second.x - first.x * second.z,
    first.x * second.y - first.y * second.x,
  );

export const vectorLength = (vector: IVector3): number => Math.sqrt(dotProduct(vector, vector));

/**
 * Нулевой вектор возвращается как есть: у него нет направления, и делить на ноль ради `NaN` бессмысленно —
 * вызывающий код сам решает, что делать с таким входом.
 */
export const normalizeVector = (vector: IVector3): IVector3 => {
  const length = vectorLength(vector);

  return length === 0 ? vector : scaleVector(vector, 1 / length);
};
