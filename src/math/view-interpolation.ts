import type { IView, TAngleRange } from '../tour/tour-types';
import { normalizeYaw, unwrapYawNear } from './angles';

const DEGREES_PER_HALF_TURN = 180;

/**
 * Допуск, с которым два вида считаются одинаковыми: меньше любой видимой разницы и больше погрешности
 * перевода углов туда и обратно.
 */
export const VIEW_TOLERANCE_DEGREES = 1e-6;

/**
 * Путь камеры от вида `start` к виду `end`. `yaw` хранится развёрнутым: прямая от `fromYaw` к `toYaw` и
 * есть путь, даже если он проходит через ±180.
 */
export interface IViewPath {
  start: IView;
  end: IView;
  fromYaw: number;
  toYaw: number;
}

/**
 * Разность `yaw` по кратчайшей дуге, от −180 до 180. Цель ровно сзади неоднозначна: тогда сторону
 * выбирает знак текущего вращения камеры `rotationSign`, а без вращения камера поворачивает вправо.
 */
export const shortestYawDelta = (fromYaw: number, toYaw: number, rotationSign: number): number => {
  const delta = normalizeYaw(toYaw - fromYaw);

  if (DEGREES_PER_HALF_TURN - Math.abs(delta) > VIEW_TOLERANCE_DEGREES) {
    return delta;
  }

  return rotationSign < 0 ? -DEGREES_PER_HALF_TURN : DEGREES_PER_HALF_TURN;
};

/**
 * Без диапазона `yaw` идёт по кратчайшей дуге. С диапазоном оба конца разворачиваются около его центра:
 * они уже внутри диапазона, поэтому прямая между ними не заходит в запрещённую зону.
 */
export const createViewPath = (
  start: IView,
  end: IView,
  yawRange: TAngleRange | undefined,
  rotationSign: number,
): IViewPath => {
  if (yawRange === undefined) {
    return {
      start,
      end,
      fromYaw: start.yaw,
      toYaw: start.yaw + shortestYawDelta(start.yaw, end.yaw, rotationSign),
    };
  }

  const center = (yawRange[0] + yawRange[1]) / 2;

  return { start, end, fromYaw: unwrapYawNear(start.yaw, center), toYaw: unwrapYawNear(end.yaw, center) };
};

const interpolate = (from: number, to: number, fraction: number): number =>
  from * (1 - fraction) + to * fraction;

/**
 * Вид на доле пути `fraction`. `yaw`, `pitch` и `fov` идут по углам с одной долей; крен и режим FOV
 * берутся из начала. Доля может выходить за [0, 1] у плавностей с перелётом — ограничения применяет
 * вызывающий. Смешивание записано как `from · (1 − t) + to · t`: в долях 0 и 1 оно даёт концы точно.
 */
export const viewAlongPath = (path: IViewPath, fraction: number): IView => ({
  ...path.start,
  yaw: normalizeYaw(interpolate(path.fromYaw, path.toYaw, fraction)),
  pitch: interpolate(path.start.pitch, path.end.pitch, fraction),
  fov: interpolate(path.start.fov, path.end.fov, fraction),
});

/**
 * Совпадают ли направление и поле обзора двух видов с точностью до `VIEW_TOLERANCE_DEGREES`.
 */
export const areViewsClose = (first: IView, second: IView): boolean =>
  Math.abs(normalizeYaw(first.yaw - second.yaw)) <= VIEW_TOLERANCE_DEGREES &&
  Math.abs(first.pitch - second.pitch) <= VIEW_TOLERANCE_DEGREES &&
  Math.abs(first.fov - second.fov) <= VIEW_TOLERANCE_DEGREES;

/**
 * Разница между видами: `yaw` — по кратчайшей дуге, `pitch` и `fov` — как есть.
 */
export interface IViewOffset {
  yaw: number;
  pitch: number;
  fov: number;
}

export const viewOffset = (from: IView, to: IView): IViewOffset => ({
  yaw: normalizeYaw(to.yaw - from.yaw),
  pitch: to.pitch - from.pitch,
  fov: to.fov - from.fov,
});

/**
 * Вид, сдвинутый на долю `factor` разницы `offset`. Так поворот, продолжающийся после смены сцены, гасит
 * скачок вида к своему концу.
 */
export const shiftView = (view: IView, offset: IViewOffset, factor: number): IView => ({
  ...view,
  yaw: normalizeYaw(view.yaw + offset.yaw * factor),
  pitch: view.pitch + offset.pitch * factor,
  fov: view.fov + offset.fov * factor,
});
