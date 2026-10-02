import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTileSlots, fitFrameTiles, tilePoolCapacity } from '../dist/internal.js';

describe('multiresolution · Пул тайлов', () => {
  it('ёмкость: 128 МБ — 128 тайлов 512, не больше лимита слоёв устройства', () => {
    assert.equal(tilePoolCapacity(128, 512, 2048), 128);
    assert.equal(tilePoolCapacity(128, 256, 256), 256);
    assert.equal(tilePoolCapacity(0, 512, 2048), 0);
  });

  it('Маленький бюджет: 8 МБ — в пуле не больше 8 тайлов, кадр урезается с подробных и дальних', () => {
    const capacity = tilePoolCapacity(8, 512, 2048);
    const frame = [
      'l1-near',
      'l1-far',
      'l2-near',
      'l2-mid',
      'l2-far',
      'l3-a',
      'l3-b',
      'l3-c',
      'l3-d',
      'l3-e',
    ];
    const [kept] = fitFrameTiles([frame], capacity);

    assert.equal(capacity, 8);
    assert.deepEqual(kept, frame.slice(0, 8));
  });

  it('при смешивании место сначала отдаётся текущей сцене, затем предыдущей', () => {
    assert.deepEqual(
      fitFrameTiles(
        [
          ['current-1', 'current-2', 'current-3'],
          ['previous-1', 'previous-2'],
        ],
        4,
      ),
      [['current-1', 'current-2', 'current-3'], ['previous-1']],
    );
  });

  it('Возврат взгляда: левые тайлы остались в пуле и находятся по URL', () => {
    const slots = createTileSlots(8);
    const none = new Set();

    for (const url of ['left-1', 'left-2', 'right-1', 'right-2']) {
      slots.place(url, none, 1);
    }

    assert.notEqual(slots.slotOf('left-1'), undefined);
    assert.notEqual(slots.slotOf('left-2'), undefined);
  });

  it('вытесняется давно не рисованный тайл, а тайлы кадра — никогда', () => {
    const slots = createTileSlots(2);
    const none = new Set();

    slots.place('old', none, 1);
    slots.place('recent', none, 1);
    slots.touch('recent', 5);

    assert.deepEqual(slots.place('new', none, 6), { slot: slots.slotOf('new'), evicted: 'old' });
    assert.equal(slots.slotOf('old'), undefined);
    assert.equal(slots.place('another', new Set(['recent', 'new']), 7), null);
  });

  it('Общие тайлы при замене тура: тот же URL — тот же слот, без повторной загрузки', () => {
    const slots = createTileSlots(4);
    const placed = slots.place('/tiles/kitchen/1/f/0_0.jpg', new Set(), 1);

    assert.deepEqual(slots.place('/tiles/kitchen/1/f/0_0.jpg', new Set(), 2), {
      slot: placed.slot,
      evicted: null,
    });
    assert.equal(slots.size(), 1);
  });

  it('remove освобождает слот для нового тайла', () => {
    const slots = createTileSlots(1);

    slots.place('first', new Set(['first']), 1);
    slots.remove('first');

    assert.equal(slots.place('second', new Set(['second']), 2)?.evicted, null);
  });
});
