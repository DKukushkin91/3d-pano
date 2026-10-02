import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  EnumCubeFace,
  EnumFovMode,
  EnumSourceType,
  LIBRARY_DEFAULT_LIMITS,
  LIBRARY_DEFAULT_VIEW,
  expandCubeFaceUrls,
  findStartScene,
  isAllowedResourceUrl,
  resolveSceneLimits,
  resolveSceneView,
  validateTour,
} from '../dist/internal.js';

const ROOM_URL = '/local/hotel-room.png';

const createScene = (id, source = { type: EnumSourceType.Equirect, url: ROOM_URL }) => ({ id, source });

const pathsOf = (issues) => issues.map((issue) => issue.path);

describe('tour-config · Структура тура', () => {
  it('Минимальный тур: одна сцена с id и source проходит валидацию', () => {
    assert.deepEqual(validateTour({ scenes: [createScene('room')] }), []);
  });

  it('Тур из ответа сервера принимается без преобразований', () => {
    const tour = JSON.parse(JSON.stringify({ startScene: 'room', scenes: [createScene('room')] }));

    assert.deepEqual(validateTour(tour), []);
  });

  it('не-объект, пустой список сцен и сцена без source дают проблемы с путями', () => {
    assert.deepEqual(pathsOf(validateTour(null)), ['']);
    assert.deepEqual(pathsOf(validateTour({ scenes: [] })), ['scenes']);
    assert.deepEqual(pathsOf(validateTour({ scenes: [{ id: 'room' }] })), ['scenes[0].source']);
  });
});

describe('tour-config · Стартовая сцена', () => {
  it('Стартовая сцена не задана: показывается первая сцена', () => {
    const tour = { scenes: [createScene('hall'), createScene('room')] };

    assert.equal(findStartScene(tour)?.id, 'hall');
  });

  it('startScene выбирает сцену по id', () => {
    const tour = { startScene: 'room', scenes: [createScene('hall'), createScene('room')] };

    assert.equal(findStartScene(tour)?.id, 'room');
  });
});

describe('tour-config · Наложение значений по умолчанию', () => {
  it('Сцена переопределяет направление, FOV берётся из defaults тура', () => {
    const scene = { ...createScene('room'), view: { yaw: 35 } };
    const tour = { defaults: { view: { fov: 80 } }, scenes: [scene] };

    assert.deepEqual(resolveSceneView(tour, scene), {
      yaw: 35,
      pitch: 0,
      roll: 0,
      fov: 80,
      fovMode: EnumFovMode.Max,
      position: { x: 0, y: 0, z: 0 },
    });
  });

  it('поле со значением undefined ничего не переопределяет', () => {
    const scene = { ...createScene('room'), view: { fov: undefined } };
    const tour = { defaults: { view: { fov: 80 } }, scenes: [scene] };

    assert.equal(resolveSceneView(tour, scene).fov, 80);
  });

  it('объект bounds сцены заменяет bounds тура целиком', () => {
    const scene = { ...createScene('room'), limits: { bounds: { pitch: [-30, 30] } } };
    const tour = { defaults: { limits: { bounds: { yaw: [-90, 90] }, fov: [70, 140] } }, scenes: [scene] };

    assert.deepEqual(resolveSceneLimits(tour, scene), {
      fov: [70, 140],
      maxPixelZoom: 2,
      bounds: { pitch: [-30, 30] },
    });
  });
});

describe('tour-config · Умолчания библиотеки', () => {
  it('Пустые умолчания: вид и ограничения совпадают с умолчаниями библиотеки', () => {
    const scene = createScene('room');
    const tour = { scenes: [scene] };

    assert.deepEqual(resolveSceneView(tour, scene), {
      yaw: 0,
      pitch: 0,
      roll: 0,
      fov: 90,
      fovMode: 'max',
      position: { x: 0, y: 0, z: 0 },
    });
    assert.deepEqual(resolveSceneLimits(tour, scene), { fov: [30, 120], maxPixelZoom: 2, bounds: 'auto' });
    assert.deepEqual(resolveSceneView(tour, scene), LIBRARY_DEFAULT_VIEW);
    assert.deepEqual(resolveSceneLimits(tour, scene), LIBRARY_DEFAULT_LIMITS);
  });
});

describe('tour-config · Валидация тура', () => {
  it('Повторяющийся идентификатор: проблема по пути scenes[1].id', () => {
    const issues = validateTour({ scenes: [createScene('kitchen'), createScene('kitchen')] });

    assert.deepEqual(pathsOf(issues), ['scenes[1].id']);
  });

  it('Несуществующая стартовая сцена: проблема по пути startScene', () => {
    const issues = validateTour({ startScene: 'hall', scenes: [createScene('room')] });

    assert.deepEqual(pathsOf(issues), ['startScene']);
  });

  it('проверяет тип источника, плейсхолдер {face} и имена граней', () => {
    const issues = validateTour({
      scenes: [
        createScene('one', { type: 'sphere', url: ROOM_URL }),
        createScene('two', { type: 'cube', url: '/tiles/two.jpg' }),
        createScene('three', { type: 'cube', url: '/tiles/{face}.jpg', faceNames: { top: 'u', front: '' } }),
      ],
    });

    assert.deepEqual(pathsOf(issues), [
      'scenes[0].source.type',
      'scenes[1].source.url',
      'scenes[2].source.faceNames.top',
      'scenes[2].source.faceNames.front',
    ]);
  });

  it('проверяет числовые диапазоны вида и ограничений', () => {
    const issues = validateTour({
      defaults: {
        view: { pitch: 120, fov: 0, fovMode: 'wide', yaw: Number.NaN },
        limits: { fov: [140, 70], maxPixelZoom: 0, bounds: { yaw: [10, -10], pitch: [-100, 0] } },
      },
      scenes: [{ ...createScene('room'), limits: { bounds: 'everywhere' } }],
    });

    assert.deepEqual(pathsOf(issues).toSorted(), [
      'defaults.limits.bounds.pitch',
      'defaults.limits.bounds.yaw',
      'defaults.limits.fov',
      'defaults.limits.maxPixelZoom',
      'defaults.view.fov',
      'defaults.view.fovMode',
      'defaults.view.pitch',
      'defaults.view.yaw',
      'scenes[0].limits.bounds',
    ]);
  });

  it('превью проверяется как источник', () => {
    const issues = validateTour({ scenes: [{ ...createScene('room'), preview: { type: 'equirect' } }] });

    assert.deepEqual(pathsOf(issues), ['scenes[0].preview.url']);
  });
});

describe('panorama-sources · Проверка URL', () => {
  it('Опасная схема: javascript: отклоняется валидацией', () => {
    const issues = validateTour({
      scenes: [createScene('room', { type: EnumSourceType.Equirect, url: 'javascript:alert(1)' })],
    });

    assert.deepEqual(pathsOf(issues), ['scenes[0].source.url']);
  });

  for (const url of [
    'https://cdn.example.com/a.jpg',
    'http://localhost/a.jpg',
    'blob:https://example.com/0d9b',
    'data:image/jpeg;base64,AAAA',
    '/local/a.jpg',
    'tiles/a.jpg',
    '//cdn.example.com/a.jpg',
  ]) {
    it(`разрешён ${url.slice(0, 32)}`, () => {
      assert.equal(isAllowedResourceUrl(url), true);
    });
  }

  for (const url of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<b>',
    'ftp://host/a.jpg',
  ]) {
    it(`запрещён ${url}`, () => {
      assert.equal(isAllowedResourceUrl(url), false);
    });
  }
});

describe('panorama-sources · Кубическая панорама из граней', () => {
  it('Имена граней neometria: f, r, b, l, u, d в порядке слоёв', () => {
    const urls = expandCubeFaceUrls({
      type: EnumSourceType.Cube,
      url: '/tiles/kitchen/l1/{face}.jpg',
      faceNames: { front: 'f', right: 'r', back: 'b', left: 'l', up: 'u', down: 'd' },
    });

    assert.deepEqual(
      urls.map(({ url }) => url),
      ['f', 'r', 'b', 'l', 'u', 'd'].map((name) => `/tiles/kitchen/l1/${name}.jpg`),
    );
  });

  it('без faceNames используются имена по умолчанию, faceNames переопределяет любые', () => {
    const urls = expandCubeFaceUrls({
      type: EnumSourceType.Cube,
      url: '/{face}/{face}.png',
      faceNames: { up: 'top' },
    });

    assert.equal(urls.find(({ face }) => face === EnumCubeFace.Front)?.url, '/front/front.png');
    assert.equal(urls.find(({ face }) => face === EnumCubeFace.Up)?.url, '/top/top.png');
  });
});

describe('tour-config · Словари значений тура', () => {
  it('Константа или строка: обе формы одинаково проходят validateTour', () => {
    const withConstant = createScene('one', { type: EnumSourceType.Cube, url: '/{face}.jpg' });
    const withString = createScene('two', { type: 'cube', url: '/{face}.jpg' });

    assert.deepEqual(validateTour({ scenes: [withConstant, withString] }), []);
  });
});

describe('tour-config · примеры из docs/tour.md', () => {
  it('каждый JSON-пример тура в документации валиден', async () => {
    const markdown = await readFile(new URL('../docs/tour.md', import.meta.url), 'utf8');
    const examples = [...markdown.matchAll(/```json\n([\s\S]*?)```/g)].map((match) =>
      JSON.parse(match[1] ?? ''),
    );
    const tours = examples.filter((example) => 'scenes' in example);
    const sources = examples.filter((example) => 'type' in example);

    assert.ok(tours.length > 0 && sources.length > 0);

    for (const tour of tours) {
      assert.deepEqual(validateTour(tour), []);
    }

    for (const source of sources) {
      assert.deepEqual(validateTour({ scenes: [createScene('example', source)] }), []);
    }
  });
});
