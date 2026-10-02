import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  NOT_ENTERED,
  enterTransition,
  hotspotLabel,
  isShownInScene,
  resolveAddHotspotOptions,
  resolveHotspotAnchor,
  resolveHotspotPlane,
  resolveHotspotPosition,
  resolveHotspotScene,
  stackingOrder,
} from '../dist/internal.js';

const POSITION = { x: 1.5, y: -0.4, z: 2 };

class FakeElement {
  tagName = 'DIV';
}

const assertRangeError = (call, name) => {
  assert.throws(
    call,
    (error) =>
      error instanceof RangeError && error.message.startsWith('3d-pano:') && error.message.includes(name),
  );
};

describe('hotspots · Видимость при смене сцен (выбор)', () => {
  it('Переход в соседнюю комнату: видны хотспоты сцены на экране и хотспоты без сцены', () => {
    const kitchenDoor = { scene: 'kitchen', distance: 2, order: 0 };
    const bedroomDoor = { scene: 'bedroom', distance: 2, order: 1 };
    const logo = { scene: null, distance: 1, order: 2 };

    assert.deepEqual(
      [kitchenDoor, bedroomDoor, logo].filter((entry) => isShownInScene(entry, 'kitchen')),
      [kitchenDoor, logo],
    );
    assert.deepEqual(
      [kitchenDoor, bedroomDoor, logo].filter((entry) => isShownInScene(entry, 'bedroom')),
      [bedroomDoor, logo],
    );
  });

  it('Пин другой сцены и пока ни одна сцена не появилась', () => {
    assert.equal(isShownInScene({ scene: 'kitchen-v2', distance: 1, order: 0 }, 'kitchen-v1'), false);
    assert.equal(isShownInScene({ scene: 'kitchen-v2', distance: 1, order: 0 }, null), false);
    assert.equal(isShownInScene({ scene: null, distance: 1, order: 0 }, null), true);
  });
});

describe('hotspots · Порядок наложения', () => {
  it('Две карточки на одной линии: ближняя (2 м) лежит выше дальней (5 м)', () => {
    const near = { scene: null, distance: 2, order: 0 };
    const far = { scene: null, distance: 5, order: 1 };

    assert.deepEqual(stackingOrder([near, far]), [far, near]);
  });

  it('при равном расстоянии раньше добавленный ниже, исходный массив не меняется', () => {
    const tourSpot = { scene: 'kitchen', distance: 1, order: 0 };
    const hostPin = { scene: null, distance: 1, order: 1 };
    const entries = [hostPin, tourSpot];

    assert.deepEqual(stackingOrder(entries), [tourSpot, hostPin]);
    assert.deepEqual(entries, [hostPin, tourSpot]);
  });
});

describe('hotspots · События хотспотов (вход и уход)', () => {
  it('Наведение и фокус вместе: один вход, уход — только когда не осталось ни того, ни другого', () => {
    const hovered = { ...NOT_ENTERED, isHovered: true };
    const hoveredAndFocused = { ...hovered, isFocused: true };
    const focusedOnly = { ...hoveredAndFocused, isHovered: false };

    assert.equal(enterTransition(NOT_ENTERED, hovered), 'enter');
    assert.equal(enterTransition(hovered, hoveredAndFocused), null);
    assert.equal(enterTransition(hoveredAndFocused, focusedOnly), null);
    assert.equal(enterTransition(focusedOnly, NOT_ENTERED), 'leave');
  });

  it('Уход при смене сцены: исчезновение наведённого хотспота — уход', () => {
    assert.equal(enterTransition({ isHovered: true, isFocused: false }, NOT_ENTERED), 'leave');
    assert.equal(enterTransition(NOT_ENTERED, NOT_ENTERED), null);
  });
});

describe('hotspots · Хотспоты из тура (подпись кнопки)', () => {
  it('title — видимый текст, без title — aria-label: title целевой сцены, её id, id хотспота', () => {
    const door = { id: 'door', position: POSITION, target: { scene: 'bedroom' } };

    assert.deepEqual(hotspotLabel({ ...door, title: 'Bedroom' }, 'Спальня'), {
      text: 'Bedroom',
      label: null,
    });
    assert.deepEqual(hotspotLabel(door, 'Спальня'), { text: '', label: 'Спальня' });
    assert.deepEqual(hotspotLabel(door, undefined), { text: '', label: 'bedroom' });
    assert.deepEqual(hotspotLabel({ id: 'window', position: POSITION }, undefined), {
      text: '',
      label: 'window',
    });
  });
});

describe('hotspots · Проверка аргументов хотспотов хоста', () => {
  const originalElement = globalThis.HTMLElement;

  beforeEach(() => {
    globalThis.HTMLElement = FakeElement;
  });

  afterEach(() => {
    globalThis.HTMLElement = originalElement;
  });

  it('умолчания: любая сцена, якорь center, без плоскости, позиция скопирована', () => {
    const element = new globalThis.HTMLElement();
    const position = { ...POSITION };
    const resolved = resolveAddHotspotOptions({ element, position });

    position.x = 0;

    assert.deepEqual(resolved, { element, position: POSITION, scene: null, anchor: 'center', plane: null });
  });

  it('element не HTMLElement — TypeError', () => {
    assert.throws(() => resolveAddHotspotOptions({ element: {}, position: POSITION }), TypeError);
    assert.throws(() => resolveAddHotspotOptions({ element: '<div>', position: POSITION }), TypeError);
  });

  it('Нулевая ширина: RangeError с именем width', () => {
    assertRangeError(
      () =>
        resolveAddHotspotOptions({
          element: new globalThis.HTMLElement(),
          position: { yaw: 0, pitch: 0 },
          plane: { width: 0 },
        }),
      'width',
    );
  });

  it('неверные position, anchor, scene, facing, spin и plane — RangeError с именем поля', () => {
    assertRangeError(() => resolveHotspotPosition({ x: 0, y: 0, z: 0 }), 'position');
    assertRangeError(() => resolveHotspotPosition({ yaw: Number.NaN, pitch: 0 }), 'position');
    assertRangeError(() => resolveHotspotAnchor('middle'), 'anchor');
    assertRangeError(() => resolveHotspotScene(42), 'scene');
    assertRangeError(() => resolveHotspotPlane({ width: 1, facing: { yaw: 0 } }), 'facing');
    assertRangeError(() => resolveHotspotPlane({ width: 1, spin: Infinity }), 'spin');
    assertRangeError(() => resolveHotspotPlane('floor'), 'plane');
    assertRangeError(() => resolveHotspotPlane({ width: Number.NaN }), 'width');
  });

  it('сцена, которой нет в туре, — не ошибка; undefined возвращает умолчания', () => {
    assert.equal(resolveHotspotScene('attic'), 'attic');
    assert.equal(resolveHotspotScene(undefined), null);
    assert.equal(resolveHotspotAnchor(undefined), 'center');
    assert.equal(resolveHotspotPlane(undefined), null);
    assert.deepEqual(resolveHotspotPlane({ width: 0.5, facing: { yaw: 0, pitch: 90 } }), {
      width: 0.5,
      facing: { yaw: 0, pitch: 90 },
      spin: 0,
    });
  });
});
