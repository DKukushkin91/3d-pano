import { CUBE_FACES, EnumSourceType } from '../tour/tour-dictionaries';
import type { IScene, TPanoramaSource } from '../tour/tour-types';

export const sourceImageCount = (source: TPanoramaSource): number =>
  source.type === EnumSourceType.Cube ? CUBE_FACES.length : 1;

/**
 * Число изображений сцены: превью и основной источник вместе — от них считается `loadProgress`.
 */
export const sceneImageCount = (scene: IScene): number =>
  sourceImageCount(scene.source) + (scene.preview === undefined ? 0 : sourceImageCount(scene.preview));

export const loadProgress = (loadedCount: number, totalCount: number): number =>
  totalCount === 0 ? 0 : Math.min(loadedCount / totalCount, 1);
