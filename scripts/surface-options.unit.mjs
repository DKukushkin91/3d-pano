import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EnumSurfaceKind, isSameSurface, resolveHotspotSurface, validateTour } from '../dist/internal.js';

const SURFACE_PATH = 'scenes[0].hotspots[0].surface';
const FLOOR_PLANE = { width: 0.5, facing: { yaw: 0, pitch: 90 } };

const HOST_FAILURES = [
  { field: 'surface', surface: '/spot.png' },
  { field: 'surface', surface: { image: '/a.png', video: '/b.mp4' } },
  { field: 'surface', surface: { width: 1 } },
  { field: 'surface.image', surface: { image: 42 } },
  { field: 'surface.image', surface: { image: '' } },
  { field: 'surface.video', surface: { video: {} } },
  { field: 'surface.width', surface: { video: '/tv.mp4', width: Number.NaN } },
];

const equirect = (name) => ({ type: 'equirect', url: `https://cdn.example.com/${name}.jpg` });

const tourWith = (hotspot) => ({
  scenes: [
    {
      id: 'room',
      source: equirect('room'),
      hotspots: [{ id: 'spot', position: { x: 0, y: -1.5, z: 2 }, ...hotspot }],
    },
    { id: 'balcony', source: equirect('balcony') },
  ],
});

const issuesOf = (hotspot) => validateTour(tourWith(hotspot)).map(({ path, message }) => ({ path, message }));

const pathsOf = (hotspot) => issuesOf(hotspot).map((issue) => issue.path);

describe('tour-config · Структура тура (поверхности)', () => {
  it('Метки с картинкой и видео: тур из JSON.parse принимается без преобразований', () => {
    const tour = JSON.parse(
      JSON.stringify({
        scenes: [
          {
            id: 'room',
            source: equirect('room'),
            hotspots: [
              {
                id: 'spot',
                position: { x: 0, y: -1.5, z: 2 },
                plane: FLOOR_PLANE,
                surface: { image: '/surfaces/floor-spot.png', width: 0.125 },
                target: { scene: 'balcony', transition: { type: 'move' } },
              },
              {
                id: 'tv',
                position: { yaw: 90, pitch: 0 },
                plane: { width: 1 },
                surface: { video: '/tv.mp4' },
              },
            ],
          },
          { id: 'balcony', source: equirect('balcony') },
        ],
      }),
    );

    assert.deepEqual(validateTour(tour), []);
  });
});

describe('hotspot-surfaces · Проверка поверхности (тур)', () => {
  it('Поверхность без плоскости: проблема с путём surface', () => {
    const issues = issuesOf({ surface: { image: '/spot.png' } });

    assert.deepEqual(
      issues.map((issue) => issue.path),
      [SURFACE_PATH],
    );
    assert.match(issues[0].message, /plane/u);
  });

  it('Картинка и видео сразу — проблема с путём surface', () => {
    assert.deepEqual(pathsOf({ plane: FLOOR_PLANE, surface: { image: 'a.png', video: 'b.mp4' } }), [
      SURFACE_PATH,
    ]);
  });

  it('ни картинки, ни видео — проблема с путём surface', () => {
    assert.deepEqual(pathsOf({ plane: FLOOR_PLANE, surface: { width: 1 } }), [SURFACE_PATH]);
  });

  it('пустой URL, не строка, неположительная или неконечная ширина, не объект', () => {
    assert.deepEqual(pathsOf({ plane: FLOOR_PLANE, surface: { image: ' ' } }), [`${SURFACE_PATH}.image`]);
    assert.deepEqual(pathsOf({ plane: FLOOR_PLANE, surface: { video: 42 } }), [`${SURFACE_PATH}.video`]);
    assert.deepEqual(pathsOf({ plane: FLOOR_PLANE, surface: { image: 'a.png', width: 0 } }), [
      `${SURFACE_PATH}.width`,
    ]);
    assert.deepEqual(pathsOf({ plane: FLOOR_PLANE, surface: { image: 'a.png', width: Infinity } }), [
      `${SURFACE_PATH}.width`,
    ]);
    assert.deepEqual(pathsOf({ plane: FLOOR_PLANE, surface: 'a.png' }), [SURFACE_PATH]);
  });

  it('все проблемы поверхности видны за один проход', () => {
    assert.deepEqual(pathsOf({ surface: { image: '', width: -1 } }), [
      `${SURFACE_PATH}.image`,
      `${SURFACE_PATH}.width`,
      SURFACE_PATH,
    ]);
  });
});

describe('hotspot-surfaces · Проверка поверхности (хост)', () => {
  it('картинка и видео по URL разбираются с шириной или без неё', () => {
    assert.deepEqual(resolveHotspotSurface({ image: '/spot.png', width: 0.125 }), {
      kind: EnumSurfaceKind.Image,
      source: '/spot.png',
      width: 0.125,
    });
    assert.deepEqual(resolveHotspotSurface({ video: '/tv.mp4' }), {
      kind: EnumSurfaceKind.Video,
      source: '/tv.mp4',
      width: null,
    });
    assert.equal(resolveHotspotSurface(undefined), null);
  });

  it('Нулевая ширина у хоста — RangeError с 3d-pano: и surface.width', () => {
    assert.throws(() => resolveHotspotSurface({ image: '/spot.png', width: 0 }), {
      name: 'RangeError',
      message: /^3d-pano: .*surface\.width/u,
    });
  });

  for (const { field, surface } of HOST_FAILURES) {
    it(`неверное ${field} — RangeError с именем поля`, () => {
      assert.throws(() => resolveHotspotSurface(surface), {
        name: 'RangeError',
        message: new RegExp(`^3d-pano: hotspot "${field.replace('.', '\\.')}"`, 'u'),
      });
    });
  }
});

describe('react-adapter · Компонент Hotspot (сравнение surface)', () => {
  const element = { name: 'canvas' };

  it('новый объект с тем же URL и шириной — та же поверхность', () => {
    assert.equal(isSameSurface({ image: '/sign.png', width: 1 }, { image: '/sign.png', width: 1 }), true);
    assert.equal(isSameSurface(undefined, undefined), true);
  });

  it('другой URL, ширина, вид или появление поверхности — другая', () => {
    assert.equal(isSameSurface({ image: '/sign.png' }, { image: '/door.png' }), false);
    assert.equal(isSameSurface({ image: '/sign.png' }, { image: '/sign.png', width: 2 }), false);
    assert.equal(isSameSurface({ image: '/tv.mp4' }, { video: '/tv.mp4' }), false);
    assert.equal(isSameSurface(undefined, { image: '/sign.png' }), false);
  });

  it('источник-элемент сравнивается по ссылке', () => {
    assert.equal(isSameSurface({ image: element }, { image: element }), true);
    assert.equal(isSameSurface({ image: element }, { image: { name: 'canvas' } }), false);
  });
});
