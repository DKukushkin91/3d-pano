import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isTiledCubeSource, tileLevelsOf, tileUrlOf, validateTour } from '../dist/internal.js';

const NEOMETRIA_FACES = { front: 'f', right: 'r', back: 'b', left: 'l', up: 'u', down: 'd' };
const FRONT = 0;
const KITCHEN_TILES = {
  type: 'cube',
  url: '/tiles/kitchen/{level}/{face}/{row}_{col}.jpg',
  faceNames: NEOMETRIA_FACES,
  tileSize: 512,
  levels: [512, 1024, 2048],
};

const URL_PATH = 'scenes[0].source.url';
const TILE_SIZE_PATH = 'scenes[0].source.tileSize';
const LEVELS_PATH = 'scenes[0].source.levels';
const SECOND_LEVEL_PATH = 'scenes[0].source.levels[1]';

const tourOf = (...sources) => ({
  scenes: sources.map((source, index) => ({ id: `scene-${String(index)}`, source })),
});

const issuesOf = (...sources) => validateTour(tourOf(...sources));

const pathsOf = (issues) => issues.map((issue) => issue.path);

const levelUrls = (source, level, face) => {
  const { tilesPerSide } = tileLevelsOf(source)[level];
  const urls = [];

  for (let row = 0; row < tilesPerSide; row += 1) {
    for (let column = 0; column < tilesPerSide; column += 1) {
      urls.push(tileUrlOf(source, { level, face, row, column }));
    }
  }

  return urls;
};

describe('multiresolution · Тайловый куб', () => {
  it('Второй уровень: грань f режется на четыре тайла 512', () => {
    assert.deepEqual(levelUrls(KITCHEN_TILES, 1, FRONT), [
      '/tiles/kitchen/1/f/0_0.jpg',
      '/tiles/kitchen/1/f/0_1.jpg',
      '/tiles/kitchen/1/f/1_0.jpg',
      '/tiles/kitchen/1/f/1_1.jpg',
    ]);
    assert.deepEqual(tileLevelsOf(KITCHEN_TILES)[1], {
      index: 1,
      faceSize: 1024,
      tilesPerSide: 2,
      tileSize: 512,
    });
  });

  it('Мелкий уровень одним тайлом: уровень, равный tileSize, — один файл 0_0', () => {
    assert.deepEqual(levelUrls(KITCHEN_TILES, 0, FRONT), ['/tiles/kitchen/0/f/0_0.jpg']);
    assert.deepEqual(tileLevelsOf(KITCHEN_TILES)[0], {
      index: 0,
      faceSize: 512,
      tilesPerSide: 1,
      tileSize: 512,
    });
  });

  it('уровень меньше tileSize — один тайл размером с уровень', () => {
    const source = { ...KITCHEN_TILES, levels: [256, 1024] };

    assert.deepEqual(tileLevelsOf(source)[0], { index: 0, faceSize: 256, tilesPerSide: 1, tileSize: 256 });
    assert.equal(tileLevelsOf(source)[1].tilesPerSide, 2);
  });

  it('без faceNames грань называется по умолчанию', () => {
    const source = { ...KITCHEN_TILES, faceNames: undefined };

    assert.equal(tileUrlOf(source, { level: 2, face: 4, row: 3, column: 1 }), '/tiles/kitchen/2/up/3_1.jpg');
  });

  it('куб тайловый, только когда заданы и tileSize, и levels', () => {
    assert.equal(isTiledCubeSource(KITCHEN_TILES), true);
    assert.equal(isTiledCubeSource({ type: 'cube', url: '/{face}.jpg' }), false);
  });
});

describe('multiresolution · Проверка тайлового куба', () => {
  it('корректный тайловый куб проходит проверку', () => {
    assert.deepEqual(issuesOf(KITCHEN_TILES), []);
  });

  it('Уровень не делится на тайлы', () => {
    const issues = issuesOf({ ...KITCHEN_TILES, levels: [512, 1500] });

    assert.deepEqual(pathsOf(issues), [SECOND_LEVEL_PATH]);
  });

  it('Шаблон без строки тайла: проблема называет {row}', () => {
    const issues = issuesOf({ ...KITCHEN_TILES, url: '/tiles/{level}/{face}_{col}.jpg' });

    assert.deepEqual(pathsOf(issues), [URL_PATH]);
    assert.match(issues[0].message, /\{row\}/u);
  });

  it('Разные размеры тайлов в туре: проблема у второй сцены', () => {
    const issues = issuesOf(KITCHEN_TILES, { ...KITCHEN_TILES, tileSize: 256, levels: [256, 512] });

    assert.deepEqual(pathsOf(issues), ['scenes[1].source.tileSize']);
  });

  it('tileSize и levels задаются только вместе', () => {
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, tileSize: undefined })), [TILE_SIZE_PATH]);
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, levels: undefined })), [LEVELS_PATH]);
  });

  it('tileSize — целое больше 0', () => {
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, tileSize: 0, levels: [512] })), [TILE_SIZE_PATH]);
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, tileSize: 512.5, levels: [512] })), [
      TILE_SIZE_PATH,
    ]);
  });

  it('levels — от 1 до 10 строго возрастающих целых больше 0', () => {
    const tooMany = Array.from({ length: 11 }, (_unused, index) => 512 * (index + 1));

    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, levels: [] })), [LEVELS_PATH]);
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, levels: tooMany })), [LEVELS_PATH]);
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, levels: [512, -1] })), [SECOND_LEVEL_PATH]);
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, levels: [1024, 1024] })), [SECOND_LEVEL_PATH]);
    assert.deepEqual(pathsOf(issuesOf({ ...KITCHEN_TILES, levels: [1024, 512] })), [SECOND_LEVEL_PATH]);
  });

  it('шаблон без {level} и {col} даёт проблему на каждую подстановку', () => {
    const issues = issuesOf({ ...KITCHEN_TILES, url: '/tiles/{face}/{row}.jpg' });

    assert.deepEqual(pathsOf(issues), [URL_PATH, URL_PATH]);
    assert.match(issues[0].message, /\{level\}/u);
    assert.match(issues[1].message, /\{col\}/u);
  });

  it('превью не может быть тайловым', () => {
    const tour = {
      scenes: [{ id: 'kitchen', source: KITCHEN_TILES, preview: KITCHEN_TILES }],
    };

    assert.deepEqual(pathsOf(validateTour(tour)), ['scenes[0].preview']);
  });

  it('куб без levels с литералом {level} в URL не тайловый и проходит проверку', () => {
    assert.deepEqual(issuesOf({ type: 'cube', url: '/{level}/{face}.jpg' }), []);
  });
});
