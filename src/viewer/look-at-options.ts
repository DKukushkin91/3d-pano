import { toDegrees } from '../math/angles';
import { anglesFromDirection } from '../math/camera-basis';
import { EnumEasing, type TEasingFunction, resolveEasing } from '../math/easing';
import type { IView } from '../tour/tour-types';
import type { ILookAtOptions, ISpherePoint, TViewTarget } from './viewer-types';

/**
 * Поворот с проверенными аргументами и умолчаниями. Цель скопирована: изменение объекта хоста после
 * вызова поворот не меняет. `fov: null` — поле обзора остаётся текущим.
 */
export interface ILookAtRequest {
  target: TViewTarget;
  fov: number | null;
  durationMs: number;
  easing: TEasingFunction;
  signal: AbortSignal | null;
}

export const DEFAULT_LOOK_AT_DURATION_MS = 900;
export const DEFAULT_LOOK_AT_EASING: typeof EnumEasing.CubicOut = EnumEasing.CubicOut;

const TARGET_REQUIREMENT =
  'a { yaw, pitch } point with finite angles or a non-zero { x, y, z } direction with finite coordinates';

const failArgument = (name: string, requirement: string, value: unknown): never => {
  throw new RangeError(`3d-pano: lookAt "${name}" must be ${requirement}, got ${String(value)}`);
};

const failTarget = (): never => {
  throw new RangeError(`3d-pano: lookAt "target" must be ${TARGET_REQUIREMENT}`);
};

const finiteField = (target: object, key: string): number | null => {
  const value: unknown = Reflect.get(target, key);

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const copySpherePoint = (target: object): ISpherePoint => {
  const yaw = finiteField(target, 'yaw');
  const pitch = finiteField(target, 'pitch');

  return yaw === null || pitch === null ? failTarget() : { yaw, pitch };
};

const copyDirection = (target: object): TViewTarget => {
  const x = finiteField(target, 'x');
  const y = finiteField(target, 'y');
  const z = finiteField(target, 'z');

  if (x === null || y === null || z === null) {
    return failTarget();
  }

  return x === 0 && y === 0 && z === 0 ? failTarget() : { x, y, z };
};

const copyTarget = (target: unknown): TViewTarget => {
  if (typeof target !== 'object' || target === null) {
    return failTarget();
  }

  return 'yaw' in target || 'pitch' in target ? copySpherePoint(target) : copyDirection(target);
};

const resolveFov = (fov: number | undefined): number | null => {
  if (fov === undefined) {
    return null;
  }

  return Number.isFinite(fov) && fov > 0 ? fov : failArgument('fov', 'a finite number of degrees > 0', fov);
};

const resolveDuration = (durationMs: number | undefined): number => {
  if (durationMs === undefined) {
    return DEFAULT_LOOK_AT_DURATION_MS;
  }

  return Number.isFinite(durationMs) && durationMs >= 0
    ? durationMs
    : failArgument('durationMs', 'a finite number >= 0', durationMs);
};

const hasAbortedFlag = (value: object): boolean => 'aborted' in value && typeof value.aborted === 'boolean';

const hasEventListeners = (value: object): boolean =>
  'addEventListener' in value && typeof value.addEventListener === 'function';

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === 'object' && value !== null && hasAbortedFlag(value) && hasEventListeners(value);

const resolveSignal = (signal: unknown): AbortSignal | null => {
  if (signal === undefined) {
    return null;
  }

  return isAbortSignal(signal) ? signal : failArgument('signal', 'an AbortSignal', signal);
};

/**
 * Проверяет аргументы `lookAt` и подставляет умолчания: 900 мс, `cubic-out`, текущее поле обзора. Неверный
 * аргумент — ошибка программиста хоста, поэтому `RangeError` сразу, ещё до того, как камера сдвинется;
 * сигнал не того типа — тоже `RangeError`, как остальные опции. Сигнал проверяется на тип раньше, чем на
 * отмену: отменённый сигнал не прячет ошибку в других аргументах.
 */
export const resolveLookAtRequest = (
  target: unknown,
  options: ILookAtOptions | undefined,
): ILookAtRequest => ({
  target: copyTarget(target),
  fov: resolveFov(options?.fov),
  durationMs: resolveDuration(options?.durationMs),
  easing: resolveEasing(options?.easing ?? DEFAULT_LOOK_AT_EASING),
  signal: resolveSignal(options?.signal),
});

const isSpherePoint = (target: TViewTarget): target is ISpherePoint => 'yaw' in target;

/**
 * Вид, к которому едет камера, до ограничений сцены: направление цели, поле обзора из опций или текущее,
 * крен и режим FOV — текущие. У направления строго вверх или вниз горизонтальной составляющей нет, и
 * `yaw` остаётся текущим, чтобы камера только наклонилась, а не развернулась.
 */
export const lookAtView = (request: ILookAtRequest, current: IView): IView => {
  const fov = request.fov ?? current.fov;

  if (isSpherePoint(request.target)) {
    return { ...current, yaw: request.target.yaw, pitch: request.target.pitch, fov };
  }

  const { x, z } = request.target;
  const angles = anglesFromDirection(request.target);
  const yaw = x === 0 && z === 0 ? current.yaw : toDegrees(angles.yaw);

  return { ...current, yaw, pitch: toDegrees(angles.pitch), fov };
};
