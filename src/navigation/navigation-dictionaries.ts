/**
 * Вид смены сцены: `cut` — новая сцена в первом же кадре после готовности, `blend` — плавное
 * растворение старой сцены в новой, `move` — шаг камеры к точке, во время которого новая сцена проявляется
 * навстречу.
 */
export const EnumTransitionType = {
  Cut: 'cut',
  Blend: 'blend',
  Move: 'move',
} as const;

export type TTransitionType = (typeof EnumTransitionType)[keyof typeof EnumTransitionType];

/**
 * Вид после смены сцены: `scene` — стартовый вид новой сцены по правилам тура, `keep` — то же направление в
 * мире, например при смене варианта ремонта той же комнаты или после шага в соседнюю.
 */
export const EnumSceneView = {
  Scene: 'scene',
  Keep: 'keep',
} as const;

export type TSceneView = (typeof EnumSceneView)[keyof typeof EnumSceneView];
