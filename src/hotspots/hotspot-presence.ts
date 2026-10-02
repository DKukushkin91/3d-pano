import type { IPreloadSceneOptions } from '../navigation/navigation-types';
import type { IHotspotTarget } from './hotspot-types';

/**
 * Хотспот в слое: сцена, в которой он показан (`null` — в любой), расстояние до камеры и порядок
 * добавления — сначала хотспоты тура, затем хоста.
 */
export interface IPresenceEntry {
  scene: string | null;
  distance: number;
  order: number;
}

/**
 * Показан ли хотспот, когда на экране сцена `sceneId`. Пока ни одна сцена не появилась (`null`), видны
 * только хотспоты без сцены.
 */
export const isShownInScene = (entry: IPresenceEntry, sceneId: string | null): boolean =>
  entry.scene === null || entry.scene === sceneId;

/**
 * Порядок наложения снизу вверх: дальние ниже ближних, при равном расстоянии раньше добавленный ниже.
 * Номер в массиве плюс один становится `z-index`.
 */
export const stackingOrder = <TEntry extends IPresenceEntry>(entries: readonly TEntry[]): TEntry[] => {
  const ordered = [...entries];

  ordered.sort((first, second) => second.distance - first.distance || first.order - second.order);

  return ordered;
};

/**
 * Вход в хотспот — наведение указателя или фокус; уход — когда не осталось ни того, ни другого. Один вход
 * на оба способа.
 */
export interface IEnterState {
  isHovered: boolean;
  isFocused: boolean;
}

export const NOT_ENTERED: Readonly<IEnterState> = { isHovered: false, isFocused: false };

export const isEntered = (state: IEnterState): boolean => state.isHovered || state.isFocused;

/**
 * Что произошло при переходе от `before` к `after`: вход, уход или ничего. Исчезновение хотспота — переход
 * к `NOT_ENTERED`, поэтому наведённый хотспот, убранный сменой сцены, получает уход.
 */
export const enterTransition = (before: IEnterState, after: IEnterState): 'enter' | 'leave' | null => {
  if (isEntered(before) === isEntered(after)) {
    return null;
  }

  return isEntered(after) ? 'enter' : 'leave';
};

/**
 * Предзагрузка цели хотспота: сцена и вид, с которым она появится после клика, — тайловая сцена готовит
 * кадр именно этого вида (например, текущего при `view: 'keep'`).
 */
export const hotspotPreloadOf = (
  target: IHotspotTarget,
): { sceneId: string; options: IPreloadSceneOptions } => ({
  sceneId: target.scene,
  options: { view: target.view },
});
