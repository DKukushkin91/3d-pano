/**
 * Именованные функции плавности классического набора Пеннера. Имена в kebab-case: семейство и сторона
 * ускорения (`-in` — разгон, `-out` — торможение, `-in-out` — оба). Кривые `-out` и `-in-out` строятся из
 * `-in` отражением; `back` и `elastic` в `-in-out` берут свои параметры (больший перелёт и более длинный
 * период), как в оригинальном наборе. Отскок — четыре параболы с вершинами в 1, каждая вдвое уже
 * предыдущей.
 */
export const EnumEasing = {
  Linear: 'linear',
  SineIn: 'sine-in',
  SineOut: 'sine-out',
  SineInOut: 'sine-in-out',
  QuadIn: 'quad-in',
  QuadOut: 'quad-out',
  QuadInOut: 'quad-in-out',
  CubicIn: 'cubic-in',
  CubicOut: 'cubic-out',
  CubicInOut: 'cubic-in-out',
  QuartIn: 'quart-in',
  QuartOut: 'quart-out',
  QuartInOut: 'quart-in-out',
  QuintIn: 'quint-in',
  QuintOut: 'quint-out',
  QuintInOut: 'quint-in-out',
  ExpoIn: 'expo-in',
  ExpoOut: 'expo-out',
  ExpoInOut: 'expo-in-out',
  CircIn: 'circ-in',
  CircOut: 'circ-out',
  CircInOut: 'circ-in-out',
  BackIn: 'back-in',
  BackOut: 'back-out',
  BackInOut: 'back-in-out',
  ElasticIn: 'elastic-in',
  ElasticOut: 'elastic-out',
  ElasticInOut: 'elastic-in-out',
  BounceIn: 'bounce-in',
  BounceOut: 'bounce-out',
  BounceInOut: 'bounce-in-out',
} as const;

export type TEasingName = (typeof EnumEasing)[keyof typeof EnumEasing];

/**
 * Функция плавности: доля прошедшего времени от 0 до 1 → доля пути. Результат может выходить за [0, 1]
 * (у `back` и `elastic`), ограничивать его — дело места применения.
 */
export type TEasingFunction = (progress: number) => number;

export type TEasing = TEasingName | TEasingFunction;

const HALF = 0.5;
const QUAD_POWER = 2;
const CUBIC_POWER = 3;
const QUART_POWER = 4;
const QUINT_POWER = 5;
const EXPO_STEEPNESS = 10;
const BACK_OVERSHOOT = 1.70158;
const BACK_IN_OUT_OVERSHOOT = BACK_OVERSHOOT * 1.525;
const ELASTIC_PERIOD = 0.3;
const ELASTIC_IN_OUT_PERIOD = ELASTIC_PERIOD * 1.5;
const BOUNCE_TIME_SCALE = 2.75;
const BOUNCE_ARCS = [
  { center: 0, halfWidth: 1 },
  { center: 1.5, halfWidth: 0.5 },
  { center: 2.25, halfWidth: 0.25 },
  { center: 2.625, halfWidth: 0.125 },
] as const;
const [, , , LAST_BOUNCE_ARC] = BOUNCE_ARCS;

const linear: TEasingFunction = (progress) => progress;

const sineIn: TEasingFunction = (progress) => 1 - Math.cos((progress * Math.PI) / 2);

const powerIn =
  (power: number): TEasingFunction =>
  (progress) =>
    progress ** power;

const expoIn: TEasingFunction = (progress) => (progress === 0 ? 0 : 2 ** (EXPO_STEEPNESS * (progress - 1)));

const circIn: TEasingFunction = (progress) => 1 - Math.sqrt(1 - progress * progress);

const backIn =
  (overshoot: number): TEasingFunction =>
  (progress) =>
    progress * progress * ((overshoot + 1) * progress - overshoot);

const elasticIn =
  (period: number): TEasingFunction =>
  (progress) => {
    if (progress === 0 || progress === 1) {
      return progress;
    }

    const shiftedProgress = progress - 1;
    const phase = ((shiftedProgress - period / 4) * 2 * Math.PI) / period;

    return -(2 ** (EXPO_STEEPNESS * shiftedProgress)) * Math.sin(phase);
  };

const bounceOut: TEasingFunction = (progress) => {
  const time = progress * BOUNCE_TIME_SCALE;
  const arc = BOUNCE_ARCS.find(({ center, halfWidth }) => time <= center + halfWidth) ?? LAST_BOUNCE_ARC;

  return 1 - arc.halfWidth * arc.halfWidth + (time - arc.center) ** 2;
};

const easeOut =
  (easeIn: TEasingFunction): TEasingFunction =>
  (progress) =>
    1 - easeIn(1 - progress);

const easeInOut =
  (easeIn: TEasingFunction): TEasingFunction =>
  (progress) =>
    progress < HALF ? easeIn(2 * progress) / 2 : 1 - easeIn(2 - 2 * progress) / 2;

const quadIn = powerIn(QUAD_POWER);
const cubicIn = powerIn(CUBIC_POWER);
const quartIn = powerIn(QUART_POWER);
const quintIn = powerIn(QUINT_POWER);
const bounceIn = easeOut(bounceOut);

const EASING_FUNCTIONS: Readonly<Record<TEasingName, TEasingFunction>> = {
  [EnumEasing.Linear]: linear,
  [EnumEasing.SineIn]: sineIn,
  [EnumEasing.SineOut]: easeOut(sineIn),
  [EnumEasing.SineInOut]: easeInOut(sineIn),
  [EnumEasing.QuadIn]: quadIn,
  [EnumEasing.QuadOut]: easeOut(quadIn),
  [EnumEasing.QuadInOut]: easeInOut(quadIn),
  [EnumEasing.CubicIn]: cubicIn,
  [EnumEasing.CubicOut]: easeOut(cubicIn),
  [EnumEasing.CubicInOut]: easeInOut(cubicIn),
  [EnumEasing.QuartIn]: quartIn,
  [EnumEasing.QuartOut]: easeOut(quartIn),
  [EnumEasing.QuartInOut]: easeInOut(quartIn),
  [EnumEasing.QuintIn]: quintIn,
  [EnumEasing.QuintOut]: easeOut(quintIn),
  [EnumEasing.QuintInOut]: easeInOut(quintIn),
  [EnumEasing.ExpoIn]: expoIn,
  [EnumEasing.ExpoOut]: easeOut(expoIn),
  [EnumEasing.ExpoInOut]: easeInOut(expoIn),
  [EnumEasing.CircIn]: circIn,
  [EnumEasing.CircOut]: easeOut(circIn),
  [EnumEasing.CircInOut]: easeInOut(circIn),
  [EnumEasing.BackIn]: backIn(BACK_OVERSHOOT),
  [EnumEasing.BackOut]: easeOut(backIn(BACK_OVERSHOOT)),
  [EnumEasing.BackInOut]: easeInOut(backIn(BACK_IN_OUT_OVERSHOOT)),
  [EnumEasing.ElasticIn]: elasticIn(ELASTIC_PERIOD),
  [EnumEasing.ElasticOut]: easeOut(elasticIn(ELASTIC_PERIOD)),
  [EnumEasing.ElasticInOut]: easeInOut(elasticIn(ELASTIC_IN_OUT_PERIOD)),
  [EnumEasing.BounceIn]: bounceIn,
  [EnumEasing.BounceOut]: bounceOut,
  [EnumEasing.BounceInOut]: easeInOut(bounceIn),
};

export const isEasingName = (value: unknown): value is TEasingName =>
  typeof value === 'string' && Object.hasOwn(EASING_FUNCTIONS, value);

/**
 * Имя → функция; своя функция хоста возвращается как есть. Неизвестное имя — ошибка программиста хоста,
 * поэтому `RangeError` сразу, а не тихая подмена на `linear`.
 */
export const resolveEasing = (easing: TEasing): TEasingFunction => {
  if (typeof easing === 'function') {
    return easing;
  }

  if (!isEasingName(easing)) {
    throw new RangeError(
      `3d-pano: easing must be a function or one of ${Object.values(EnumEasing).join(', ')}, got ${String(easing)}`,
    );
  }

  return EASING_FUNCTIONS[easing];
};
