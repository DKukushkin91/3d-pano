import { clamp } from '../math/angles';
import {
  type IViewOffset,
  type IViewPath,
  areViewsClose,
  createViewPath,
  shiftView,
  viewAlongPath,
  viewOffset,
} from '../math/view-interpolation';
import { type IDeferred, createDeferred } from '../navigation/deferred';
import type { IView, IViewSettings, TAngleRange } from '../tour/tour-types';
import { type ILookAtRequest, lookAtView } from './look-at-options';

/**
 * Всё, что поворот берёт у просмотрщика: камеру, состояние ввода и цикл отрисовки. Время приходит в
 * `step`, поэтому поворот проверяется в Node с настоящей камерой и поддельными часами.
 */
export interface ICameraMotionHost {
  getView: () => IView;
  setView: (settings: IViewSettings) => void;
  constrained: (view: IView) => IView;
  yawRange: () => TAngleRange | undefined;
  isInputActive: () => boolean;
  inertiaYawVelocity: () => number;
  stopInertia: () => void;
  requestFrame: () => void;
}

/**
 * Плавный поворот камеры. `start` возвращает промис поворота; `step` вызывается из кадра отрисовки и
 * возвращает `true`, пока нужен следующий кадр. `interrupt` прерывает поворот (ввод пользователя,
 * `setView`), `handleSceneChange` — появление новой сцены.
 */
export interface ICameraMotion {
  start: (request: ILookAtRequest) => Promise<boolean>;
  step: (timeMs: number) => boolean;
  interrupt: () => void;
  handleSceneChange: (keepMotion: boolean) => void;
  dispose: () => void;
}

interface ISceneJump {
  offset: IViewOffset;
  fromFraction: number;
}

interface IActiveMotion {
  request: ILookAtRequest;
  path: IViewPath;
  jump: ISceneJump | null;
  startMs: number | null;
  fraction: number;
  deferred: IDeferred<boolean>;
  removeAbortListener: () => void;
}

const yawDirection = (path: IViewPath): number => Math.sign(path.toYaw - path.fromYaw);

const timeFraction = (motion: IActiveMotion, timeMs: number): number => {
  motion.startMs ??= timeMs;

  return clamp((timeMs - motion.startMs) / motion.request.durationMs, 0, 1);
};

const motionView = (motion: IActiveMotion, fraction: number): IView => {
  const view = viewAlongPath(motion.path, motion.request.easing(fraction));
  const { jump } = motion;

  if (jump === null) {
    return view;
  }

  return shiftView(view, jump.offset, (1 - fraction) / (1 - jump.fromFraction));
};

/**
 * Время поворота отсчитывается с первого кадра, как у смешивания сцен: занятый главный поток не съедает
 * начало пути. Каждый кадр вид проходит через ограничения камеры, а в конце ставится точный итоговый вид.
 * Без анимации поворот заканчивается сразу при `durationMs: 0` и когда камера уже смотрит на цель.
 *
 * Если поворот продолжается после смены сцены (`keepMotion`), кривая пересчитывается к цели под
 * ограничения новой сцены, а скачок вида — разница между новым видом и кривой в момент смены — линейно
 * гаснет к концу поворота. Время окончания не меняется.
 */
export const createCameraMotion = (host: ICameraMotionHost): ICameraMotion => {
  let active: IActiveMotion | null = null;
  let isDisposed = false;

  const finish = (motion: IActiveMotion, isReached: boolean): void => {
    if (active === motion) {
      active = null;
    }

    motion.removeAbortListener();
    motion.deferred.resolve(isReached);
  };

  const interrupt = (): void => {
    if (active !== null) {
      finish(active, false);
    }
  };

  const listenAbort = (motion: IActiveMotion, signal: AbortSignal | null): void => {
    if (signal === null) {
      return;
    }

    const handleAbort = (): void => {
      finish(motion, false);
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    motion.removeAbortListener = () => {
      signal.removeEventListener('abort', handleAbort);
    };
  };

  const currentRotationSign = (): number =>
    active === null ? Math.sign(host.inertiaYawVelocity()) : yawDirection(active.path);

  const start = (request: ILookAtRequest): Promise<boolean> => {
    if (isDisposed || request.signal?.aborted === true || host.isInputActive()) {
      return Promise.resolve(false);
    }

    const rotationSign = currentRotationSign();

    interrupt();
    host.stopInertia();

    const current = host.getView();
    const target = host.constrained(lookAtView(request, current));

    if (request.durationMs === 0 || areViewsClose(current, target)) {
      host.setView({ yaw: target.yaw, pitch: target.pitch, fov: target.fov });
      host.requestFrame();

      return Promise.resolve(true);
    }

    const motion: IActiveMotion = {
      request,
      path: createViewPath(current, target, host.yawRange(), rotationSign),
      jump: null,
      startMs: null,
      fraction: 0,
      deferred: createDeferred<boolean>(),
      removeAbortListener: () => undefined,
    };

    active = motion;
    listenAbort(motion, request.signal);
    host.requestFrame();

    return motion.deferred.promise;
  };

  const step = (timeMs: number): boolean => {
    if (active === null) {
      return false;
    }

    const motion = active;
    const fraction = timeFraction(motion, timeMs);

    motion.fraction = fraction;

    if (fraction < 1) {
      host.setView(motionView(motion, fraction));

      return true;
    }

    const { end } = motion.path;

    host.setView({ yaw: end.yaw, pitch: end.pitch, fov: end.fov });
    finish(motion, true);

    return false;
  };

  const continueAfterSceneChange = (motion: IActiveMotion): void => {
    const anchor = host.getView();
    const target = host.constrained(lookAtView(motion.request, anchor));
    const yawRange = host.yawRange();
    const rotationSign = yawDirection(motion.path);

    if (motion.startMs === null) {
      motion.path = createViewPath(anchor, target, yawRange, rotationSign);
      motion.jump = null;

      return;
    }

    motion.path = createViewPath(motion.path.start, target, yawRange, rotationSign);
    motion.jump = {
      offset: viewOffset(viewAlongPath(motion.path, motion.request.easing(motion.fraction)), anchor),
      fromFraction: motion.fraction,
    };
  };

  return {
    start,
    step,
    interrupt,
    handleSceneChange: (keepMotion) => {
      if (active === null) {
        return;
      }

      if (keepMotion) {
        continueAfterSceneChange(active);
        host.requestFrame();
      } else {
        finish(active, false);
      }
    },
    dispose: () => {
      isDisposed = true;
      interrupt();
    },
  };
};
