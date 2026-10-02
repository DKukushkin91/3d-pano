import { CUBE_FACES, EnumSourceType } from '../tour/tour-dictionaries';
import type { IScene, TPanoramaSource } from '../tour/tour-types';

const sourceParts = (source: TPanoramaSource | undefined): readonly unknown[] | null => {
  if (source === undefined) {
    return null;
  }

  if (source.type === EnumSourceType.Equirect) {
    return [source.type, source.url];
  }

  return [
    source.type,
    source.url,
    CUBE_FACES.map((face) => source.faceNames?.[face] ?? null),
    source.tileSize ?? null,
    source.levels ?? null,
  ];
};

/**
 * Ключ кэша по содержимому сцены — источнику и превью, а не по `id`: подготовленная сцена переживает
 * замену тура, если в новом туре у неё те же файлы, а сцена с тем же `id` и другим файлом не покажет
 * старую картинку. Имена граней раскладываются в фиксированном порядке, поэтому порядок ключей
 * `faceNames` в JSON тура не важен; у тайлового куба в ключ входит и пирамида.
 */
export const sceneKeyOf = (scene: IScene): string =>
  JSON.stringify([sourceParts(scene.source), sourceParts(scene.preview)]);
