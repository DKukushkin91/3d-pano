import type { IHotspot } from './hotspot-types';

/**
 * Подпись кнопки по умолчанию: `text` — видимый текст из `title`, `label` — доступное имя для кнопки без
 * `title`, чтобы она не была пустой для скринридера.
 */
export interface IHotspotLabel {
  text: string;
  label: string | null;
}

/**
 * Без `title` кнопка получает `aria-label` по цепочке: `title` целевой сцены, её `id`, затем `id`
 * хотспота. `sceneTitle` — `title` сцены `target.scene`, если он есть.
 */
export const hotspotLabel = (hotspot: IHotspot, sceneTitle: string | undefined): IHotspotLabel => {
  if (hotspot.title !== undefined && hotspot.title !== '') {
    return { text: hotspot.title, label: null };
  }

  return { text: '', label: sceneTitle ?? hotspot.target?.scene ?? hotspot.id };
};
