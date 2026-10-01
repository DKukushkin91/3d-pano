import { toDegrees, toRadians } from '../math/angles';
import { halfTangentsFromFov } from '../math/field-of-view';
import { type IViewportSize, normalizedFromScreen } from '../math/rectilinear';
import type { IView } from '../tour/tour-types';

export interface IScreenPosition {
  x: number;
  y: number;
}

/**
 * Начало перетаскивания: вид и положение указателя в момент нажатия.
 */
export interface IDragStart {
  view: IView;
  pointer: IScreenPosition;
}

const cameraAnglesAt = (
  pointer: IScreenPosition,
  view: IView,
  viewport: IViewportSize,
): { horizontal: number; vertical: number } => {
  const halfTangents = halfTangentsFromFov(
    toRadians(view.fov),
    view.fovMode,
    viewport.width / viewport.height,
  );
  const point = normalizedFromScreen(pointer.x, pointer.y, viewport);

  return {
    horizontal: toDegrees(Math.atan(point.x * halfTangents.width)),
    vertical: toDegrees(Math.atan(point.y * halfTangents.height)),
  };
};

/**
 * Перетаскивание «тянуть»: изображение идёт за указателем. Смещение указателя переводится в углы
 * относительно осей камеры на момент нажатия — горизонтальное движение меняет `yaw`, вертикальное —
 * `pitch`. На горизонте точка под указателем остаётся под ним. Мировые `yaw`/`pitch` точек под указателем
 * для этого не подходят: у зенита и надира все направления сходятся, и малое движение мыши давало бы
 * огромную разницу `yaw` — камера крутилась бы по кругу вместо наклона. Считается от начала жеста, поэтому
 * ошибка не копится. `isInverted` меняет направление.
 */
export const dragView = (
  start: IDragStart,
  pointer: IScreenPosition,
  viewport: IViewportSize,
  isInverted: boolean,
): { yaw: number; pitch: number } => {
  const anchor = cameraAnglesAt(start.pointer, start.view, viewport);
  const current = cameraAnglesAt(pointer, start.view, viewport);
  const direction = isInverted ? -1 : 1;

  return {
    yaw: start.view.yaw + direction * (anchor.horizontal - current.horizontal),
    pitch: start.view.pitch + direction * (anchor.vertical - current.vertical),
  };
};
