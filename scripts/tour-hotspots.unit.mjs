import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EnumHotspotAnchor, validateTour } from '../dist/internal.js';

const ROOM_URL = '/local/hotel-room.png';

const createScene = (id, hotspots) => ({ id, source: { type: 'equirect', url: ROOM_URL }, hotspots });

const tourWith = (hotspots, extraScenes = []) => ({
  scenes: [createScene('kitchen', hotspots), createScene('bedroom'), ...extraScenes],
});

const FIRST = 'scenes[0].hotspots[0]';

const pathsOf = (issues) => issues.map((issue) => issue.path);

const issuePaths = (hotspots) => pathsOf(validateTour(tourWith(hotspots)));

const DOOR = {
  id: 'door',
  position: { x: 1.2, y: -1.5, z: 2.4 },
  title: 'Bedroom',
  target: { scene: 'bedroom', transition: { type: 'blend', durationMs: 800 } },
  data: { icon: 'door', nested: [1, 2, 3] },
  anchor: 'bottom',
  plane: { width: 0.5, facing: { yaw: 0, pitch: 90 }, spin: 15 },
};

describe('tour-config · Структура тура (хотспоты)', () => {
  it('Хотспоты в JSON: тур из JSON.parse с target и data принимается без преобразований', () => {
    const tour = JSON.parse(
      JSON.stringify(tourWith([DOOR, { id: 'window', position: { yaw: 40, pitch: 5 } }])),
    );

    assert.deepEqual(validateTour(tour), []);
    assert.deepEqual(tour.scenes[0].hotspots[0].data, DOOR.data);
  });

  it('без hotspots и с пустым массивом тур корректен', () => {
    assert.deepEqual(issuePaths(undefined), []);
    assert.deepEqual(issuePaths([]), []);
  });
});

describe('hotspots · Якорь (словарь)', () => {
  it('EnumHotspotAnchor содержит девять положений, константа и строка равнозначны', () => {
    assert.deepEqual(Object.values(EnumHotspotAnchor), [
      'center',
      'top',
      'bottom',
      'left',
      'right',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
    assert.deepEqual(issuePaths([{ ...DOOR, anchor: EnumHotspotAnchor.TopLeft }]), []);
  });
});

describe('tour-config · Валидация хотспотов', () => {
  it('Переход в несуществующую сцену: путь scenes[2].hotspots[0].target.scene', () => {
    const tour = {
      scenes: [
        createScene('kitchen'),
        createScene('bedroom'),
        createScene('hall', [{ ...DOOR, target: { scene: 'attic' } }]),
      ],
    };

    assert.deepEqual(pathsOf(validateTour(tour)), ['scenes[2].hotspots[0].target.scene']);
  });

  it('переход в сцену, описанную ниже, допустим', () => {
    const tour = {
      scenes: [createScene('kitchen', [{ ...DOOR, target: { scene: 'hall' } }]), createScene('hall')],
    };

    assert.deepEqual(validateTour(tour), []);
  });

  it('Повторяющийся id хотспота: путь scenes[0].hotspots[1].id, в разных сценах одинаковые id допустимы', () => {
    assert.deepEqual(issuePaths([DOOR, { ...DOOR }]), ['scenes[0].hotspots[1].id']);

    const tour = {
      scenes: [
        createScene('kitchen', [{ ...DOOR, target: undefined }]),
        createScene('bedroom', [{ ...DOOR, target: undefined }]),
      ],
    };

    assert.deepEqual(validateTour(tour), []);
  });

  it('hotspots не массив, хотспот не объект, пустой id', () => {
    assert.deepEqual(issuePaths({ door: DOOR }), ['scenes[0].hotspots']);
    assert.deepEqual(issuePaths(['door']), [FIRST]);
    assert.deepEqual(issuePaths([{ ...DOOR, id: ' ' }]), [`${FIRST}.id`]);
  });

  it('position: неконечные углы, неполная точка, нулевое направление, не объект', () => {
    for (const position of [
      { yaw: Number.NaN, pitch: 0 },
      { yaw: 10 },
      { x: 1, y: 0 },
      { x: 0, y: 0, z: 0 },
      'north',
      undefined,
    ]) {
      assert.deepEqual(issuePaths([{ ...DOOR, position }]), [`${FIRST}.position`]);
    }
  });

  it('title не строка и anchor не из словаря', () => {
    assert.deepEqual(issuePaths([{ ...DOOR, title: 42 }]), [`${FIRST}.title`]);
    assert.deepEqual(issuePaths([{ ...DOOR, anchor: 'middle' }]), [`${FIRST}.anchor`]);
  });

  it('target: не объект, неверный переход, keepMotion не булево', () => {
    assert.deepEqual(issuePaths([{ ...DOOR, target: 'bedroom' }]), [`${FIRST}.target`]);

    const badTransition = validateTour(
      tourWith([{ ...DOOR, target: { scene: 'bedroom', transition: { type: 'blend', durationMs: -1 } } }]),
    );

    assert.deepEqual(pathsOf(badTransition), [`${FIRST}.target`]);
    assert.match(badTransition[0].message, /durationMs/);
    assert.doesNotMatch(badTransition[0].message, /^3d-pano:/);
    assert.deepEqual(issuePaths([{ ...DOOR, target: { scene: 'bedroom', view: 'sideways' } }]), [
      `${FIRST}.target`,
    ]);
    assert.deepEqual(issuePaths([{ ...DOOR, target: { scene: 'bedroom', transition: null } }]), [
      `${FIRST}.target`,
    ]);
    assert.deepEqual(issuePaths([{ ...DOOR, target: { scene: 'bedroom', keepMotion: 'yes' } }]), [
      `${FIRST}.target.keepMotion`,
    ]);
  });

  it('plane: не объект, ширина 0, неконечные facing и spin', () => {
    assert.deepEqual(issuePaths([{ ...DOOR, plane: 0.5 }]), [`${FIRST}.plane`]);
    assert.deepEqual(issuePaths([{ ...DOOR, plane: { width: 0 } }]), [`${FIRST}.plane.width`]);
    assert.deepEqual(issuePaths([{ ...DOOR, plane: { width: 1, facing: { yaw: 0 } } }]), [
      `${FIRST}.plane.facing`,
    ]);
    assert.deepEqual(issuePaths([{ ...DOOR, plane: { width: 1, spin: Infinity } }]), [`${FIRST}.plane.spin`]);
  });

  it('все проблемы хотспотов сообщаются за один проход', () => {
    const issues = issuePaths([{ id: '', position: null, anchor: 'middle', plane: { width: -1 } }]);

    assert.deepEqual(issues, [`${FIRST}.id`, `${FIRST}.position`, `${FIRST}.anchor`, `${FIRST}.plane.width`]);
  });
});
