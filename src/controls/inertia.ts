/**
 * Угловая скорость камеры в градусах в секунду.
 */
export interface IAngularVelocity {
  yaw: number;
  pitch: number;
}

/**
 * Образец положения камеры во время перетаскивания: по последним образцам считается скорость броска.
 */
export interface IMotionSample {
  timeMs: number;
  yaw: number;
  pitch: number;
}

export const INERTIA_SAMPLE_WINDOW_MS = 100;
export const INERTIA_DECAY_PER_SECOND = 5;
export const INERTIA_STOP_SPEED_DEGREES_PER_SECOND = 0.5;
export const INERTIA_MAX_SPEED_DEGREES_PER_SECOND = 720;

export const ZERO_VELOCITY: Readonly<IAngularVelocity> = { yaw: 0, pitch: 0 };

const capSpeed = (velocity: IAngularVelocity): IAngularVelocity => {
  const speed = Math.hypot(velocity.yaw, velocity.pitch);

  if (speed <= INERTIA_MAX_SPEED_DEGREES_PER_SECOND) {
    return velocity;
  }

  const factor = INERTIA_MAX_SPEED_DEGREES_PER_SECOND / speed;

  return { yaw: velocity.yaw * factor, pitch: velocity.pitch * factor };
};

/**
 * Скорость броска по образцам за последние 100 мс до отпускания. Если указатель перед отпусканием стоял на
 * месте дольше окна, образцов нет и скорость нулевая — вращение не продолжается.
 */
export const releaseVelocity = (
  samples: readonly IMotionSample[],
  releaseTimeMs: number,
): IAngularVelocity => {
  const recent = samples.filter((sample) => releaseTimeMs - sample.timeMs <= INERTIA_SAMPLE_WINDOW_MS);
  const first = recent[0];
  const last = recent.at(-1);

  if (first === undefined || last === undefined || last.timeMs === first.timeMs) {
    return ZERO_VELOCITY;
  }

  const elapsedSeconds = (last.timeMs - first.timeMs) / 1000;

  return capSpeed({
    yaw: (last.yaw - first.yaw) / elapsedSeconds,
    pitch: (last.pitch - first.pitch) / elapsedSeconds,
  });
};

/**
 * Экспоненциальное затухание: за секунду скорость падает в `e^(5 × friction)` раз, остановка — ниже
 * 0,5 °/с. `frictionMultiplier` — опция `controls.inertiaFriction`.
 */
export const decayVelocity = (
  velocity: IAngularVelocity,
  elapsedSeconds: number,
  frictionMultiplier: number,
): IAngularVelocity => {
  const factor = Math.exp(-INERTIA_DECAY_PER_SECOND * frictionMultiplier * elapsedSeconds);
  const next = { yaw: velocity.yaw * factor, pitch: velocity.pitch * factor };

  return Math.hypot(next.yaw, next.pitch) < INERTIA_STOP_SPEED_DEGREES_PER_SECOND ? ZERO_VELOCITY : next;
};

export const isMoving = (velocity: IAngularVelocity): boolean => velocity.yaw !== 0 || velocity.pitch !== 0;
