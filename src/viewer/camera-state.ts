import type { ICssSize } from '../dom/size-observer';
import { normalizeYaw, toDegrees, toRadians } from '../math/angles';
import { anglesFromDirection, cameraBasisFromAngles, directionFromAngles } from '../math/camera-basis';
import { halfTangentsFromFov } from '../math/field-of-view';
import { directionFromScreen, screenFromDirection } from '../math/rectilinear';
import { type ISceneSpace, modelPointInDirection, sceneDirection } from '../math/scene-space';
import { type IVector3, subtractVectors } from '../math/vector3';
import type { IFrameCamera } from '../render/renderer';
import { EnumFovMode, type TFovMode } from '../tour/tour-dictionaries';
import type { IResolvedViewLimits, IView, IViewSettings, TAngleRange } from '../tour/tour-types';
import { constrainView } from '../view/view-limits';
import type { IDirection, IProjectedPoint, ISpherePoint, TViewTarget } from './viewer-types';

/**
 * Камера просмотрщика: вид в градусах, ограничения сцены, CSS-размер кадра и плотность загруженного
 * источника. Любое изменение снова проводит вид через `constrainView`. `constrained` проводит через те же
 * ограничения произвольный вид, не меняя камеру: так поворот заранее знает, куда приедет. Пространство
 * сцены (`setSpace`, во время шага) сдвигает камеру от центра: его видят `getView().position`, `project`,
 * `unproject` и кадр отрисовки.
 */
export interface ICameraState {
  getView: () => IView;
  setView: (settings: IViewSettings) => void;
  constrained: (view: IView) => IView;
  yawRange: () => TAngleRange | undefined;
  resetScene: (view: IView, limits: IResolvedViewLimits) => void;
  setLimits: (limits: IResolvedViewLimits) => void;
  setViewport: (size: ICssSize) => void;
  getViewport: () => ICssSize;
  setSourceDensity: (pixelsPerRadian: number | null) => void;
  setSpace: (space: ISceneSpace | null) => void;
  frameCamera: () => IFrameCamera | null;
  frameCameraOf: (view: IView) => IFrameCamera | null;
  project: (point: TViewTarget) => IProjectedPoint | null;
  unproject: (x: number, y: number) => ISpherePoint | null;
  takeViewChange: () => IView | null;
}

const MIN_VIEWPORT_SIZE = 1;

const isSpherePoint = (point: TViewTarget): point is ISpherePoint => 'yaw' in point && 'pitch' in point;

const directionOf = (point: TViewTarget): IVector3 =>
  isSpherePoint(point) ? directionFromAngles(toRadians(point.yaw), toRadians(point.pitch)) : point;

const hasArea = (size: ICssSize): boolean => size.width > 0 && size.height > 0;

const angleOrCurrent = (name: keyof IViewSettings, value: number | undefined, current: number): number => {
  if (value === undefined) {
    return current;
  }

  if (!Number.isFinite(value)) {
    throw new RangeError(`3d-pano: view "${name}" must be a finite number of degrees, got ${String(value)}`);
  }

  return value;
};

const fovModeOrCurrent = (value: TFovMode | undefined, current: TFovMode): TFovMode => {
  if (value === undefined) {
    return current;
  }

  if (!Object.values(EnumFovMode).some((mode) => mode === value)) {
    throw new RangeError(
      `3d-pano: view "fovMode" must be one of ${Object.values(EnumFovMode).join(', ')}, got ${value}`,
    );
  }

  return value;
};

/**
 * Накладывает переданные поля вида на текущий; `undefined` поле не меняет. Нечисловой угол — ошибка
 * программиста хоста, поэтому `RangeError`, как у опций.
 */
export const applyViewSettings = (current: IView, settings: IViewSettings): IView => ({
  yaw: angleOrCurrent('yaw', settings.yaw, current.yaw),
  pitch: angleOrCurrent('pitch', settings.pitch, current.pitch),
  roll: angleOrCurrent('roll', settings.roll, current.roll),
  fov: angleOrCurrent('fov', settings.fov, current.fov),
  fovMode: fovModeOrCurrent(settings.fovMode, current.fovMode),
  position: current.position,
});

/**
 * Пока у контейнера нет размера (скрыт или ещё не размечен), ограничения считаются для кадра 1×1, а при
 * появлении размера вид пересчитывается.
 */
export const createCameraState = (
  initialView: IView,
  initialLimits: IResolvedViewLimits,
  initialViewport: ICssSize,
): ICameraState => {
  let limits = initialLimits;
  let viewport = initialViewport;
  let sourcePixelsPerRadian: number | null = null;
  let view = initialView;
  let space: ISceneSpace | null = null;
  let isViewChanged = true;

  const position = (): IDirection =>
    space === null ? { x: 0, y: 0, z: 0 } : { x: space.offset.x, y: space.offset.y, z: space.offset.z };

  const isSameOffset = (next: ISceneSpace | null): boolean => {
    const current = position();
    const offset = next?.offset ?? { x: 0, y: 0, z: 0 };

    return current.x === offset.x && current.y === offset.y && current.z === offset.z;
  };

  const pointFromCamera = (point: TViewTarget): IVector3 => {
    if (space === null) {
      return directionOf(point);
    }

    const scenePoint = isSpherePoint(point) ? modelPointInDirection(space.model, directionOf(point)) : point;

    return subtractVectors(scenePoint, space.offset);
  };

  const constrainedView = (nextView: IView, previousFov: number | null): IView =>
    constrainView(nextView, {
      limits,
      viewportWidth: Math.max(viewport.width, MIN_VIEWPORT_SIZE),
      viewportHeight: Math.max(viewport.height, MIN_VIEWPORT_SIZE),
      sourcePixelsPerRadian,
      previousFov,
    });

  const constrain = (nextView: IView, previousFov: number | null): void => {
    view = constrainedView(nextView, previousFov);
    isViewChanged = true;
  };

  const cameraOf = (cameraView: IView): IFrameCamera => ({
    basis: cameraBasisFromAngles(
      toRadians(cameraView.yaw),
      toRadians(cameraView.pitch),
      toRadians(cameraView.roll),
    ),
    halfTangents: halfTangentsFromFov(
      toRadians(cameraView.fov),
      cameraView.fovMode,
      viewport.width / viewport.height,
    ),
  });

  const currentCamera = (): IFrameCamera => (space === null ? cameraOf(view) : { ...cameraOf(view), space });

  const project = (point: TViewTarget): IProjectedPoint | null => {
    if (!hasArea(viewport)) {
      return null;
    }

    const { basis, halfTangents } = currentCamera();

    return screenFromDirection(pointFromCamera(point), viewport, basis, halfTangents);
  };

  const unproject = (x: number, y: number): ISpherePoint | null => {
    if (!hasArea(viewport)) {
      return null;
    }

    const { basis, halfTangents } = currentCamera();
    const ray = directionFromScreen(x, y, viewport, basis, halfTangents);
    const angles = anglesFromDirection(space === null ? ray : sceneDirection(space.model, space.offset, ray));

    return { yaw: normalizeYaw(toDegrees(angles.yaw)), pitch: toDegrees(angles.pitch) };
  };

  const takeViewChange = (): IView | null => {
    if (!isViewChanged) {
      return null;
    }

    isViewChanged = false;

    return { ...view, position: position() };
  };

  constrain(initialView, null);

  return {
    getView: () => ({ ...view, position: position() }),
    setView: (settings) => {
      constrain(applyViewSettings(view, settings), view.fov);
    },
    constrained: (nextView) => constrainedView(nextView, view.fov),
    yawRange: () => (typeof limits.bounds === 'string' ? undefined : limits.bounds.yaw),
    resetScene: (nextView, nextLimits) => {
      limits = nextLimits;
      sourcePixelsPerRadian = null;
      constrain(nextView, null);
    },
    setLimits: (nextLimits) => {
      limits = nextLimits;
      constrain(view, view.fov);
    },
    setViewport: (size) => {
      viewport = size;
      constrain(view, view.fov);
    },
    getViewport: () => viewport,
    setSourceDensity: (pixelsPerRadian) => {
      sourcePixelsPerRadian = pixelsPerRadian;
      constrain(view, view.fov);
    },
    setSpace: (nextSpace) => {
      isViewChanged ||= !isSameOffset(nextSpace);
      space = nextSpace;
    },
    frameCamera: () => (hasArea(viewport) ? currentCamera() : null),
    frameCameraOf: (cameraView) => (hasArea(viewport) ? cameraOf(cameraView) : null),
    project,
    unproject,
    takeViewChange,
  };
};
