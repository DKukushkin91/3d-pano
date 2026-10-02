import type { ISpherePoint, TViewTarget } from './viewer-types';

/**
 * Что требуется от цели — для текста ошибок `lookAt` и хотспотов.
 */
export const VIEW_TARGET_REQUIREMENT =
  'a { yaw, pitch } point with finite angles or a non-zero { x, y, z } direction with finite coordinates';

const finiteField = (target: object, key: string): number | null => {
  const value: unknown = Reflect.get(target, key);

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const copySpherePoint = (target: object): ISpherePoint | null => {
  const yaw = finiteField(target, 'yaw');
  const pitch = finiteField(target, 'pitch');

  return yaw === null || pitch === null ? null : { yaw, pitch };
};

const copyDirection = (target: object): TViewTarget | null => {
  const x = finiteField(target, 'x');
  const y = finiteField(target, 'y');
  const z = finiteField(target, 'z');

  if (x === null || y === null || z === null) {
    return null;
  }

  return x === 0 && y === 0 && z === 0 ? null : { x, y, z };
};

/**
 * Копия цели из непроверенного значения или `null`, если цель неверна: точка сферы с конечными `yaw` и
 * `pitch` или ненулевое направление с конечными `x`, `y`, `z`. Копия защищает от изменения объекта хоста
 * после вызова; что делать с неверной целью, решает вызывающий.
 */
export const parseViewTarget = (value: unknown): TViewTarget | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  return 'yaw' in value || 'pitch' in value ? copySpherePoint(value) : copyDirection(value);
};
