import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveScenePlace, validateTour } from '../dist/internal.js';

const source = { type: 'equirect', url: '/panoramas/room.jpg' };

const pathsOf = (issues) => issues.map((issue) => issue.path);

describe('scene-space · Место сцены в мире', () => {
  it('Две комнаты в одной системе координат: позиция и heading берутся как есть', () => {
    const kitchen = { id: 'kitchen', source, position: { x: 0, y: 0, z: 0 } };
    const bedroom = { id: 'bedroom', source, position: { x: 4, y: 0, z: 2 }, heading: 90 };
    const tour = { scenes: [kitchen, bedroom] };

    assert.deepEqual(resolveScenePlace(tour, bedroom), {
      position: { x: 4, y: 0, z: 2 },
      heading: 90,
      cameraHeight: null,
    });
    assert.equal(resolveScenePlace(tour, kitchen).heading, 0);
  });

  it('Высота камеры для всего тура: сцена переопределяет умолчание тура', () => {
    const hall = { id: 'hall', source };
    const bedroom = { id: 'bedroom', source, cameraHeight: 1.6 };
    const tour = { defaults: { cameraHeight: 1.5 }, scenes: [hall, bedroom] };

    assert.equal(resolveScenePlace(tour, hall).cameraHeight, 1.5);
    assert.equal(resolveScenePlace(tour, bedroom).cameraHeight, 1.6);
  });

  it('без места в мире — позиции нет, heading 0, высоты нет', () => {
    const room = { id: 'room', source };

    assert.deepEqual(resolveScenePlace({ scenes: [room] }, room), {
      position: null,
      heading: 0,
      cameraHeight: null,
    });
  });
});

describe('scene-space · Проверка места сцены', () => {
  it('Квартира в мире: тур с position, heading и defaults.cameraHeight валиден', () => {
    const tour = JSON.parse(
      JSON.stringify({
        defaults: { cameraHeight: 1.5 },
        scenes: [
          { id: 'kitchen', source, position: { x: 0, y: 0, z: 0 }, heading: 0 },
          { id: 'bedroom', source, position: { x: 4, y: 0, z: 2 }, heading: 90, cameraHeight: 1.6 },
        ],
      }),
    );

    assert.deepEqual(validateTour(tour), []);
  });

  it('Нулевая высота камеры: проблема scenes[0].cameraHeight', () => {
    assert.deepEqual(pathsOf(validateTour({ scenes: [{ id: 'a', source, cameraHeight: 0 }] })), [
      'scenes[0].cameraHeight',
    ]);
  });

  it('Позиция строкой: проблема scenes[1].position', () => {
    const tour = {
      scenes: [
        { id: 'a', source },
        { id: 'b', source, position: '0,0,0' },
      ],
    };

    assert.deepEqual(pathsOf(validateTour(tour)), ['scenes[1].position']);
  });

  it('позиция без конечных x, y, z, бесконечный heading и неверная высота в defaults', () => {
    const tour = {
      defaults: { cameraHeight: -1 },
      scenes: [
        { id: 'a', source, position: { x: 1, y: Number.NaN, z: 0 }, heading: Number.POSITIVE_INFINITY },
      ],
    };

    assert.deepEqual(pathsOf(validateTour(tour)), [
      'scenes[0].position',
      'scenes[0].heading',
      'defaults.cameraHeight',
    ]);
  });
});
