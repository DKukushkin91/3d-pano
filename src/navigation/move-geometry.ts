import { toRadians } from '../math/angles';
import { directionFromAngles } from '../math/camera-basis';
import {
  type ISceneModel,
  type ISceneTransfer,
  modelPointInDirection,
  sceneModelOf,
  toNextScene,
  transferBetweenPlaces,
} from '../math/scene-space';
import { type IVector3, createVector3, scaleVector, vectorLength } from '../math/vector3';
import type { IScenePlace } from '../tour/scene-place';
import type { IView } from '../tour/tour-types';
import type { TViewTarget } from '../viewer/viewer-types';

/**
 * Геометрия шага, посчитанная в момент появления новой сцены: куда идёт камера (в осях старой сцены),
 * пересчёт в новую сцену, модели обеих сцен и сила размытия.
 */
export interface IMoveGeometry {
  step: IVector3;
  transfer: ISceneTransfer;
  fromModel: ISceneModel;
  toModel: ISceneModel;
  blur: number;
}

/**
 * Что нужно для геометрии: места сцен, текущий вид (для шага в центр кадра) и опции перехода — точка
 * шага (явная или хотспота), доворот в градусах и размытие.
 */
export interface IMoveRequest {
  from: IScenePlace;
  to: IScenePlace;
  view: IView;
  point: TViewTarget | null;
  turn: number | null;
  blur: number;
}

/**
 * Состояние шага в момент времени: сдвиги камеры от центров старой и новой сцены и сила размытия.
 */
export interface IMoveFrame {
  fromOffset: IVector3;
  toOffset: IVector3;
  blurStrength: number;
}

const isSpherePoint = (point: TViewTarget): point is { yaw: number; pitch: number } => 'yaw' in point;

const pointInSpace = (point: TViewTarget, model: ISceneModel): IVector3 =>
  isSpherePoint(point)
    ? modelPointInDirection(model, directionFromAngles(toRadians(point.yaw), toRadians(point.pitch)))
    : createVector3(point.x, point.y, point.z);

const atEyeLevel = (point: IVector3): IVector3 => createVector3(point.x, 0, point.z);

const turnOf = (request: IMoveRequest): number =>
  request.turn === null ? toRadians(request.from.heading - request.to.heading) : toRadians(request.turn);

const placedTransfer = (request: IMoveRequest): ISceneTransfer | null => {
  const { from, to } = request;

  if (request.point !== null || from.position === null || to.position === null) {
    return null;
  }

  return transferBetweenPlaces(
    { position: from.position, heading: toRadians(from.heading) },
    { position: to.position, heading: toRadians(to.heading) },
  );
};

const stepTarget = (request: IMoveRequest, model: ISceneModel): IVector3 => {
  const target = request.point ?? { yaw: request.view.yaw, pitch: request.view.pitch };

  return atEyeLevel(pointInSpace(target, model));
};

/**
 * Точка шага: явная (или точка хотспота) — по горизонтали на высоте центра; без неё, если у обеих сцен
 * есть место в мире, — ровно центр новой сцены; иначе — точка модели в центре кадра по горизонтали. Центр
 * новой сцены считается лежащим в точке шага всегда, кроме случая с местами сцен, поэтому шаг заканчивается
 * в центре новой сцены. Доворот — `turn`, иначе разность `heading`.
 */
export const resolveMoveGeometry = (request: IMoveRequest): IMoveGeometry => {
  const placed = placedTransfer(request);
  const step = placed?.center ?? stepTarget(request, sceneModelOf(request.from.cameraHeight));
  const transfer = placed ?? { center: step, turn: turnOf(request) };
  const stepLength = vectorLength(step);

  return {
    step,
    transfer,
    fromModel: sceneModelOf(request.from.cameraHeight, stepLength),
    toModel: sceneModelOf(request.to.cameraHeight, stepLength),
    blur: request.blur,
  };
};

/**
 * Шаг к моменту с линейным прогрессом `progress` и сглаженным `eased` (та же плавность, что у веса
 * смешивания): камера на `eased` пути, новая сцена видит её из той же точки мира. Размытие наибольшее в
 * середине и пропадает к краям: `blur · sin(π · progress)`.
 */
export const moveFrameAt = (geometry: IMoveGeometry, progress: number, eased: number): IMoveFrame => {
  const fromOffset = scaleVector(geometry.step, eased);
  const isMoving = progress > 0 && progress < 1;

  return {
    fromOffset,
    toOffset: toNextScene(geometry.transfer, fromOffset),
    blurStrength: isMoving ? geometry.blur * Math.sin(Math.PI * progress) : 0,
  };
};
