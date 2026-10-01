/**
 * Вид смены сцены: `cut` — новая сцена в первом же кадре после готовности, `blend` — плавное
 * растворение старой сцены в новой.
 */
export const EnumTransitionType = {
  Cut: 'cut',
  Blend: 'blend',
} as const;

export type TTransitionType = (typeof EnumTransitionType)[keyof typeof EnumTransitionType];

/**
 * Вид после смены сцены: `scene` — стартовый вид новой сцены по правилам тура, `keep` — текущий вид,
 * например при смене варианта ремонта той же комнаты.
 */
export const EnumSceneView = {
  Scene: 'scene',
  Keep: 'keep',
} as const;

export type TSceneView = (typeof EnumSceneView)[keyof typeof EnumSceneView];
