import { CUBE_FACES, type TCubeFace } from './tour-dictionaries';
import type { ICubeSource } from './tour-types';

export const FACE_PLACEHOLDER = '{face}';

const URL_SCHEME = /^([a-z][\d+.a-z-]*):/i;
const ALLOWED_SCHEMES = new Set(['http', 'https', 'blob']);
const DATA_IMAGE_PREFIX = 'data:image/';

/**
 * Разрешены `http:`, `https:`, `blob:`, `data:image/` и относительные пути. Остальные схемы
 * (`javascript:`, `file:` и т. п.) отклоняются до загрузки: тур приходит извне и не должен уметь
 * подсунуть что-то кроме изображения.
 */
export const isAllowedResourceUrl = (url: string): boolean => {
  const scheme = URL_SCHEME.exec(url)?.[1]?.toLowerCase();

  if (scheme === undefined) {
    return true;
  }

  if (scheme === 'data') {
    return url.toLowerCase().startsWith(DATA_IMAGE_PREFIX);
  }

  return ALLOWED_SCHEMES.has(scheme);
};

export interface ICubeFaceUrl {
  face: TCubeFace;
  url: string;
}

/**
 * URL шести граней в порядке слоёв текстуры (`CUBE_FACES`).
 */
export const expandCubeFaceUrls = (source: ICubeSource): ICubeFaceUrl[] =>
  CUBE_FACES.map((face) => ({
    face,
    url: source.url.replaceAll(FACE_PLACEHOLDER, source.faceNames?.[face] ?? face),
  }));
