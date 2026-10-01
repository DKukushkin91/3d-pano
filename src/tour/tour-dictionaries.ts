/**
 * Тип источника панорамы сцены. Строки и константы словаря равнозначны: тур из `JSON.parse` проходит
 * проверку типов без приведения.
 */
export const EnumSourceType = {
  Equirect: 'equirect',
  Cube: 'cube',
} as const;

export type TSourceType = (typeof EnumSourceType)[keyof typeof EnumSourceType];

/**
 * Грани куба в порядке слоёв текстуры: вперёд, вправо, назад, влево, вверх, вниз — по часовой стрелке
 * вокруг вертикали, затем полюса.
 */
export const EnumCubeFace = {
  Front: 'front',
  Right: 'right',
  Back: 'back',
  Left: 'left',
  Up: 'up',
  Down: 'down',
} as const;

export type TCubeFace = (typeof EnumCubeFace)[keyof typeof EnumCubeFace];

export const CUBE_FACES: readonly TCubeFace[] = [
  EnumCubeFace.Front,
  EnumCubeFace.Right,
  EnumCubeFace.Back,
  EnumCubeFace.Left,
  EnumCubeFace.Up,
  EnumCubeFace.Down,
];

/**
 * К какой стороне кадра относится угол обзора: `max` — к большей, поэтому вид одинаково «широкий» и в
 * альбомной, и в портретной ориентации.
 */
export const EnumFovMode = {
  Horizontal: 'horizontal',
  Vertical: 'vertical',
  Diagonal: 'diagonal',
  Max: 'max',
} as const;

export type TFovMode = (typeof EnumFovMode)[keyof typeof EnumFovMode];

export const EnumBoundsMode = {
  Auto: 'auto',
  None: 'none',
} as const;

export type TBoundsMode = (typeof EnumBoundsMode)[keyof typeof EnumBoundsMode];
