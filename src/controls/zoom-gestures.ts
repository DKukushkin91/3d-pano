import { toDegrees, toRadians } from '../math/angles';

export const WHEEL_ZOOM_OCTAVES_PER_PIXEL = 0.002;
export const WHEEL_LINE_HEIGHT_PX = 16;
export const WHEEL_PAGE_HEIGHT_PX = 800;

const DELTA_MODE_LINE = 1;
const DELTA_MODE_PAGE = 2;

/**
 * Масштаб через тангенс половины угла: одинаковое движение пальцев или колеса даёт одинаковое ощущение
 * приближения при любом FOV и в любом режиме FOV.
 */
export const scaleFov = (fovDegrees: number, tangentFactor: number): number =>
  toDegrees(2 * Math.atan(Math.tan(toRadians(fovDegrees) / 2) * tangentFactor));

/**
 * Прокрутка колеса в пикселях независимо от режима события: строки и страницы приводятся к пикселям.
 */
export const wheelDeltaPixels = (deltaY: number, deltaMode: number): number => {
  if (deltaMode === DELTA_MODE_LINE) {
    return deltaY * WHEEL_LINE_HEIGHT_PX;
  }

  return deltaMode === DELTA_MODE_PAGE ? deltaY * WHEEL_PAGE_HEIGHT_PX : deltaY;
};

/**
 * Колесо вперёд (отрицательный `deltaY`) приближает. `wheelSpeed` умножает показатель степени, поэтому
 * при 2 один щелчок меняет `tan(fov/2)` вдвое сильнее в логарифмическом смысле.
 */
export const wheelFov = (fovDegrees: number, deltaPixels: number, wheelSpeed: number): number =>
  scaleFov(fovDegrees, 2 ** (deltaPixels * WHEEL_ZOOM_OCTAVES_PER_PIXEL * wheelSpeed));

/**
 * Щипок: `tan(fov/2)` меняется обратно пропорционально расстоянию между пальцами — раздвинули вдвое,
 * изображение стало вдвое крупнее.
 */
export const pinchFov = (startFovDegrees: number, startDistance: number, currentDistance: number): number =>
  currentDistance <= 0 ? startFovDegrees : scaleFov(startFovDegrees, startDistance / currentDistance);
