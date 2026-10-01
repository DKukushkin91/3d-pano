import type { IView } from '../tour/tour-types';
import { scaleFov } from './zoom-gestures';

/**
 * Действия клавиатуры: повороты и масштаб.
 */
export const EnumKeyAction = {
  TurnLeft: 'turn-left',
  TurnRight: 'turn-right',
  TurnUp: 'turn-up',
  TurnDown: 'turn-down',
  ZoomIn: 'zoom-in',
  ZoomOut: 'zoom-out',
} as const;

export type TKeyAction = (typeof EnumKeyAction)[keyof typeof EnumKeyAction];

const ACTION_BY_KEY: ReadonlyMap<string, TKeyAction> = new Map<string, TKeyAction>([
  ['ArrowLeft', EnumKeyAction.TurnLeft],
  ['ArrowRight', EnumKeyAction.TurnRight],
  ['ArrowUp', EnumKeyAction.TurnUp],
  ['ArrowDown', EnumKeyAction.TurnDown],
  ['+', EnumKeyAction.ZoomIn],
  ['=', EnumKeyAction.ZoomIn],
  ['-', EnumKeyAction.ZoomOut],
  ['_', EnumKeyAction.ZoomOut],
]);

/**
 * Действие по `KeyboardEvent.key`: стрелки поворачивают, `+`/`=` приближают, `−`/`_` отдаляют (клавиши с
 * Shift и без него — одна физическая кнопка).
 */
export const keyActionFromKey = (key: string): TKeyAction | undefined => ACTION_BY_KEY.get(key);

/**
 * Скорости клавиатурного движения: повороты — в градусах в секунду при FOV 90, масштаб — в октавах
 * `tan(fov/2)` в секунду (отрицательные приближают).
 */
export interface IKeyboardMotion {
  yaw: number;
  pitch: number;
  zoom: number;
}

export const KEYBOARD_TURN_DEGREES_PER_SECOND = 60;
export const KEYBOARD_ZOOM_OCTAVES_PER_SECOND = 1;
export const KEYBOARD_RESPONSE_SECONDS = 0.12;
export const KEYBOARD_REFERENCE_FOV_DEGREES = 90;

const STOP_THRESHOLD = 1e-3;

export const STILL_MOTION: Readonly<IKeyboardMotion> = { yaw: 0, pitch: 0, zoom: 0 };

const axis = (pressed: ReadonlySet<TKeyAction>, positive: TKeyAction, negative: TKeyAction): number =>
  Number(pressed.has(positive)) - Number(pressed.has(negative));

/**
 * Целевая скорость для набора зажатых действий; `keyboardSpeed` — опция `controls.keyboardSpeed`.
 */
export const targetMotion = (pressed: ReadonlySet<TKeyAction>, keyboardSpeed: number): IKeyboardMotion => ({
  yaw:
    axis(pressed, EnumKeyAction.TurnRight, EnumKeyAction.TurnLeft) *
    KEYBOARD_TURN_DEGREES_PER_SECOND *
    keyboardSpeed,
  pitch:
    axis(pressed, EnumKeyAction.TurnUp, EnumKeyAction.TurnDown) *
    KEYBOARD_TURN_DEGREES_PER_SECOND *
    keyboardSpeed,
  zoom:
    axis(pressed, EnumKeyAction.ZoomOut, EnumKeyAction.ZoomIn) *
    KEYBOARD_ZOOM_OCTAVES_PER_SECOND *
    keyboardSpeed,
});

const approach = (current: number, target: number, blend: number): number => {
  const next = current + (target - current) * blend;

  return target === 0 && Math.abs(next) < STOP_THRESHOLD ? 0 : next;
};

/**
 * Плавный разгон и торможение: скорость экспоненциально приближается к целевой за ~0,12 с.
 */
export const stepMotion = (
  current: IKeyboardMotion,
  target: IKeyboardMotion,
  elapsedSeconds: number,
): IKeyboardMotion => {
  const blend = 1 - Math.exp(-elapsedSeconds / KEYBOARD_RESPONSE_SECONDS);

  return {
    yaw: approach(current.yaw, target.yaw, blend),
    pitch: approach(current.pitch, target.pitch, blend),
    zoom: approach(current.zoom, target.zoom, blend),
  };
};

export const isMotionActive = (motion: IKeyboardMotion): boolean =>
  motion.yaw !== 0 || motion.pitch !== 0 || motion.zoom !== 0;

/**
 * Сдвиг вида за кадр. Повороты замедляются пропорционально FOV: при сильном приближении стрелка двигает
 * изображение на экране с той же видимой скоростью.
 */
export const applyMotion = (
  view: IView,
  motion: IKeyboardMotion,
  elapsedSeconds: number,
): Pick<IView, 'yaw' | 'pitch' | 'fov'> => {
  const fovScale = view.fov / KEYBOARD_REFERENCE_FOV_DEGREES;

  return {
    yaw: view.yaw + motion.yaw * fovScale * elapsedSeconds,
    pitch: view.pitch + motion.pitch * fovScale * elapsedSeconds,
    fov: scaleFov(view.fov, 2 ** (motion.zoom * elapsedSeconds)),
  };
};
