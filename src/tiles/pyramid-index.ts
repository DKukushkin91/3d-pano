import {
  type ITileAddress,
  type ITileLevel,
  type TTiledCubeSource,
  tileLevelsOf,
  tileUrlOf,
} from '../tour/tile-pyramid';
import { CUBE_FACES } from '../tour/tour-dictionaries';
import { tileTableIndex, tileTableOffsets } from './tile-math';
import type { ITileWant } from './tile-queue';
import { type IVisibleTile, baseTilesOf, tileKeyOf } from './visible-tiles';

/**
 * Пирамида тайловой сцены по URL: какой тайл стоит за URL, какого он размера, где его запись в таблице
 * сопоставления и с каким приоритетом его просили. Сцена узнаёт свой тайл, когда очередь его доставила.
 */
export interface IPyramidIndex {
  levels: readonly ITileLevel[];
  baseLevel: ITileLevel;
  offsets: readonly number[];
  entryCount: number;
  baseUrls: readonly string[];
  isBaseUrl: (url: string) => boolean;
  remember: (address: ITileAddress) => string;
  urlOf: (address: ITileAddress) => string;
  rememberWanted: (tile: IVisibleTile, isPreload: boolean) => string;
  addressOf: (url: string) => ITileAddress | undefined;
  priorityOf: (url: string) => ITileWant | undefined;
  tileSizeOf: (url: string) => number | null;
  tableIndexOf: (url: string) => number | null;
}

export const createPyramidIndex = (source: TTiledCubeSource): IPyramidIndex => {
  const levels = tileLevelsOf(source);
  const [baseLevel = { index: 0, faceSize: source.tileSize, tilesPerSide: 1, tileSize: source.tileSize }] =
    levels;
  const lastLevel = levels.at(-1) ?? baseLevel;
  const offsets = tileTableOffsets(levels.map((level) => level.tilesPerSide));
  const addresses = new Map<string, ITileAddress>();
  const urls = new Map<string, string>();
  const priorities = new Map<string, ITileWant>();

  const urlOf = (address: ITileAddress): string => {
    const key = tileKeyOf(address);
    const known = urls.get(key);

    if (known !== undefined) {
      return known;
    }

    const url = tileUrlOf(source, address);

    urls.set(key, url);

    return url;
  };

  const remember = (address: ITileAddress): string => {
    const url = urlOf(address);

    addresses.set(url, {
      level: address.level,
      face: address.face,
      row: address.row,
      column: address.column,
    });

    return url;
  };

  const baseUrls = baseTilesOf(baseLevel).map(remember);
  const baseUrlSet = new Set(baseUrls);

  return {
    levels,
    baseLevel,
    offsets,
    entryCount: (offsets.at(-1) ?? 0) + CUBE_FACES.length * lastLevel.tilesPerSide ** 2,
    baseUrls,
    isBaseUrl: (url) => baseUrlSet.has(url),
    remember,
    urlOf,
    rememberWanted: (tile, isPreload) => {
      const url = remember(tile);

      priorities.set(url, { url, level: tile.level, distance: tile.distance, isPreload });

      return url;
    },
    addressOf: (url) => addresses.get(url),
    priorityOf: (url) => priorities.get(url),
    tileSizeOf: (url) => {
      const address = addresses.get(url);

      return address === undefined ? null : (levels[address.level]?.tileSize ?? null);
    },
    tableIndexOf: (url) => {
      const address = addresses.get(url);
      const level = address === undefined ? undefined : levels[address.level];

      if (address === undefined || level === undefined || address.level === 0) {
        return null;
      }

      return tileTableIndex(offsets[address.level] ?? 0, level.tilesPerSide, address);
    },
  };
};
