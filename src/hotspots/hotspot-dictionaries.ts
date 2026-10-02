/**
 * Какая точка элемента хотспота лежит в проекции его `position`: центр, середина стороны или угол.
 * Строки и константы словаря равнозначны, поэтому якорь можно писать прямо в JSON тура.
 */
export const EnumHotspotAnchor = {
  Center: 'center',
  Top: 'top',
  Bottom: 'bottom',
  Left: 'left',
  Right: 'right',
  TopLeft: 'top-left',
  TopRight: 'top-right',
  BottomLeft: 'bottom-left',
  BottomRight: 'bottom-right',
} as const;

export type THotspotAnchor = (typeof EnumHotspotAnchor)[keyof typeof EnumHotspotAnchor];

/**
 * Где лежит точка якоря в долях размера элемента: `x` — от левого края к правому, `y` — от верхнего к
 * нижнему. Контейнер библиотеки сдвигает элемент на эти доли процентами `translate`, без измерения.
 */
export const HOTSPOT_ANCHOR_FRACTIONS: Readonly<Record<THotspotAnchor, { x: number; y: number }>> = {
  [EnumHotspotAnchor.Center]: { x: 0.5, y: 0.5 },
  [EnumHotspotAnchor.Top]: { x: 0.5, y: 0 },
  [EnumHotspotAnchor.Bottom]: { x: 0.5, y: 1 },
  [EnumHotspotAnchor.Left]: { x: 0, y: 0.5 },
  [EnumHotspotAnchor.Right]: { x: 1, y: 0.5 },
  [EnumHotspotAnchor.TopLeft]: { x: 0, y: 0 },
  [EnumHotspotAnchor.TopRight]: { x: 1, y: 0 },
  [EnumHotspotAnchor.BottomLeft]: { x: 0, y: 1 },
  [EnumHotspotAnchor.BottomRight]: { x: 1, y: 1 },
};

export const isHotspotAnchor = (value: unknown): value is THotspotAnchor =>
  Object.values(EnumHotspotAnchor).some((anchor) => anchor === value);
