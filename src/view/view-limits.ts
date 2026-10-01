import { clamp, normalizeYaw, toDegrees, toRadians } from '../math/angles';
import { type IHalfTangents, fovFromHalfTangents, halfTangentsFromFov } from '../math/field-of-view';
import type { TFovMode } from '../tour/tour-dictionaries';
import type { IBoundsRanges, IResolvedViewLimits, IView, TAngleRange } from '../tour/tour-types';

const MAX_PITCH_DEGREES = 90;
const DEGREES_PER_TURN = 360;

/**
 * Всё, кроме самого вида, от чего зависят ограничения: размер кадра в CSS-пикселях, плотность
 * загруженного источника и FOV до изменения.
 */
export interface IViewConstraintContext {
  limits: IResolvedViewLimits;
  viewportWidth: number;
  viewportHeight: number;
  sourcePixelsPerRadian: number | null;
  previousFov: number | null;
}

/**
 * Плотность эквиректангулярного источника: ширина изображения приходится на полный оборот.
 */
export const pixelsPerRadianForEquirect = (imageWidth: number): number => imageWidth / (2 * Math.PI);

/**
 * Плотность куба в центре грани: грань занимает отрезок тангенса от −1 до 1, а у центра тангенс растёт
 * так же, как угол, — на радиан приходится половина размера грани. К краям плотность выше, поэтому
 * ограничение по центру — самое осторожное.
 */
export const pixelsPerRadianForCube = (faceSize: number): number => faceSize / 2;

const fovForHalfHeightTangent = (heightTangent: number, fovMode: TFovMode, aspect: number): number =>
  toDegrees(fovFromHalfTangents({ width: heightTangent * aspect, height: heightTangent }, fovMode, aspect));

/**
 * Наименьший FOV, при котором один пиксель источника в центре кадра занимает не больше `maxPixelZoom`
 * CSS-пикселей; `null`, пока плотность источника неизвестна.
 */
export const minimumFovForPixelZoom = (view: IView, context: IViewConstraintContext): number | null => {
  if (context.sourcePixelsPerRadian === null) {
    return null;
  }

  const cssPixelsPerRadianLimit = context.limits.maxPixelZoom * context.sourcePixelsPerRadian;
  const heightTangent = context.viewportHeight / (2 * cssPixelsPerRadianLimit);

  return fovForHalfHeightTangent(heightTangent, view.fovMode, context.viewportWidth / context.viewportHeight);
};

const constrainFov = (view: IView, context: IViewConstraintContext): number => {
  const [minimumFov, maximumFov] = context.limits.fov;
  const limitedFov = clamp(view.fov, minimumFov, maximumFov);
  const pixelFloor = minimumFovForPixelZoom(view, context);

  if (pixelFloor === null) {
    return limitedFov;
  }

  return Math.max(limitedFov, Math.min(pixelFloor, context.previousFov ?? pixelFloor));
};

const halfExtentsDegrees = (halfTangents: IHalfTangents): { width: number; height: number } => ({
  width: toDegrees(Math.atan(halfTangents.width)),
  height: toDegrees(Math.atan(halfTangents.height)),
});

const fovFittingHalfAngle = (
  side: keyof IHalfTangents,
  halfAngleDegrees: number,
  fovMode: TFovMode,
  aspect: number,
): number => {
  const tangent = Math.tan(toRadians(halfAngleDegrees));
  const halfTangents =
    side === 'width'
      ? { width: tangent, height: tangent / aspect }
      : { width: tangent * aspect, height: tangent };

  return toDegrees(fovFromHalfTangents(halfTangents, fovMode, aspect));
};

const unwrapYawNear = (yaw: number, reference: number): number =>
  yaw + DEGREES_PER_TURN * Math.round((reference - yaw) / DEGREES_PER_TURN);

const clampCenter = (center: number, range: TAngleRange, halfExtent: number): number =>
  clamp(center, range[0] + halfExtent, range[1] - halfExtent);

const fitFovIntoRange = (
  fov: number,
  side: keyof IHalfTangents,
  range: TAngleRange | undefined,
  fovMode: TFovMode,
  aspect: number,
): number => {
  if (range === undefined) {
    return fov;
  }

  const halfRange = (range[1] - range[0]) / 2;
  const halfExtent = halfExtentsDegrees(halfTangentsFromFov(toRadians(fov), fovMode, aspect))[side];

  return halfExtent > halfRange ? fovFittingHalfAngle(side, halfRange, fovMode, aspect) : fov;
};

const fitFovIntoRanges = (view: IView, ranges: IBoundsRanges, aspect: number): number => {
  const fovFittingYaw = fitFovIntoRange(view.fov, 'width', ranges.yaw, view.fovMode, aspect);

  return fitFovIntoRange(fovFittingYaw, 'height', ranges.pitch, view.fovMode, aspect);
};

const constrainToRanges = (view: IView, ranges: IBoundsRanges, aspect: number): IView => {
  const fov = fitFovIntoRanges(view, ranges, aspect);
  const extents = halfExtentsDegrees(halfTangentsFromFov(toRadians(fov), view.fovMode, aspect));
  const yawRange = ranges.yaw;
  const pitchRange = ranges.pitch;
  const yaw =
    yawRange === undefined
      ? view.yaw
      : clampCenter(unwrapYawNear(view.yaw, (yawRange[0] + yawRange[1]) / 2), yawRange, extents.width);
  const pitch = pitchRange === undefined ? view.pitch : clampCenter(view.pitch, pitchRange, extents.height);

  return { ...view, fov, yaw, pitch };
};

/**
 * Приводит вид к ограничениям сцены: нормализует `yaw`, держит центр взгляда в `pitch` −90…90, ограничивает
 * FOV пределами и разрешением источника, а при диапазонах `bounds` удерживает внутри них весь кадр — если
 * кадр шире диапазона, FOV уменьшается. Для полной сферы `auto` и `none` дают одно и то же.
 *
 * Ограничение по пикселям не даёт приближать дальше, но не отдаляет камеру само: пока видно маленькое
 * превью, текущий FOV (`previousFov`) остаётся, а уменьшить его нельзя. Иначе загрузка превью рывком меняла
 * бы вид.
 */
export const constrainView = (view: IView, context: IViewConstraintContext): IView => {
  const aspect = context.viewportWidth / context.viewportHeight;
  const leveledView: IView = {
    ...view,
    yaw: normalizeYaw(view.yaw),
    pitch: clamp(view.pitch, -MAX_PITCH_DEGREES, MAX_PITCH_DEGREES),
    fov: constrainFov(view, context),
  };
  const { bounds } = context.limits;

  if (typeof bounds === 'string') {
    return leveledView;
  }

  const boundedView = constrainToRanges(leveledView, bounds, aspect);

  return { ...boundedView, yaw: normalizeYaw(boundedView.yaw) };
};
