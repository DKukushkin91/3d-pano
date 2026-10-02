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
