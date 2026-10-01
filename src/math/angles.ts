const DEGREES_PER_HALF_TURN = 180;
const DEGREES_PER_TURN = 360;

/**
 * Публичный API работает в градусах, математика — в радианах; переводить единицы можно только этими
 * двумя функциями, чтобы граница была видна в коде.
 */
export const toRadians = (degrees: number): number => (degrees * Math.PI) / DEGREES_PER_HALF_TURN;

export const toDegrees = (radians: number): number => (radians * DEGREES_PER_HALF_TURN) / Math.PI;

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/**
 * Приводит `yaw` к полуинтервалу (−180, 180]: −180 и 180 — одно направление, и наружу всегда отдаётся
 * 180, чтобы сравнение видов не зависело от того, с какой стороны пришла камера.
 */
export const normalizeYaw = (yawDegrees: number): number => {
  const wrapped = ((yawDegrees % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN;

  return wrapped > DEGREES_PER_HALF_TURN ? wrapped - DEGREES_PER_TURN : wrapped;
};
