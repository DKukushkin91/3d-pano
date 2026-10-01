import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  ERROR_CATEGORY_BY_CODE,
  EnumErrorCategory,
  EnumErrorCode,
  EnumViewerStatus,
  INITIAL_SNAPSHOT,
  createEventEmitter,
  createSnapshotStore,
} from '../dist/internal.js';

const SCENE_ID = 'room';

describe('viewer-state-events · Типизированные события', () => {
  it('Подписка и отписка: после отписки обработчик больше не вызывается', () => {
    const emitter = createEventEmitter();
    const received = [];
    const unsubscribe = emitter.on('sceneReady', (payload) => {
      received.push(payload.sceneId);
    });

    emitter.emit('sceneReady', { sceneId: SCENE_ID });
    unsubscribe();
    emitter.emit('sceneReady', { sceneId: 'hall' });

    assert.deepEqual(received, [SCENE_ID]);
  });

  it('подписка внутри обработчика не попадает в текущую рассылку', () => {
    const emitter = createEventEmitter();
    let lateCalls = 0;

    emitter.on('sceneReady', () => {
      emitter.on('sceneReady', () => {
        lateCalls += 1;
      });
    });
    emitter.emit('sceneReady', { sceneId: SCENE_ID });

    assert.equal(lateCalls, 0);
  });

  it('clear снимает все обработчики', () => {
    const emitter = createEventEmitter();
    let calls = 0;

    emitter.on('error', () => {
      calls += 1;
    });
    emitter.clear();
    emitter.emit('error', { error: null });

    assert.equal(calls, 0);
  });
});

describe('viewer-state-events · Изоляция обработчиков', () => {
  const reported = [];
  const originalReportError = globalThis.reportError;

  beforeEach(() => {
    reported.length = 0;
    globalThis.reportError = (error) => {
      reported.push(error);
    };
  });

  afterEach(() => {
    globalThis.reportError = originalReportError;
  });

  it('Падающий обработчик: второй обработчик вызывается, исключение уходит в reportError', () => {
    const emitter = createEventEmitter();
    const failure = new Error('host handler failed');
    let secondCalls = 0;

    emitter.on('sceneReady', () => {
      throw failure;
    });
    emitter.on('sceneReady', () => {
      secondCalls += 1;
    });
    emitter.emit('sceneReady', { sceneId: SCENE_ID });

    assert.equal(secondCalls, 1);
    assert.deepEqual(reported, [failure]);
  });

  it('исключение подписчика снимка тоже изолируется', () => {
    const store = createSnapshotStore();
    const failure = new Error('listener failed');
    let secondCalls = 0;

    store.subscribe(() => {
      throw failure;
    });
    store.subscribe(() => {
      secondCalls += 1;
    });
    store.update({ status: EnumViewerStatus.Ready });

    assert.equal(secondCalls, 1);
    assert.deepEqual(reported, [failure]);
  });
});

describe('viewer-state-events · Снимок состояния', () => {
  it('начальный снимок: loading, без сцены, прогресс 0, без взаимодействия и ошибки', () => {
    assert.deepEqual(createSnapshotStore().getSnapshot(), {
      sceneId: null,
      status: 'loading',
      loadProgress: 0,
      isInteracting: false,
      error: null,
    });
    assert.ok(Object.isFrozen(INITIAL_SNAPSHOT));
  });

  it('Повторное чтение: без изменений возвращается тот же объект', () => {
    const store = createSnapshotStore();

    store.update({ sceneId: SCENE_ID });

    assert.equal(store.getSnapshot(), store.getSnapshot());
  });

  it('update с теми же значениями не создаёт новый объект и не будит подписчиков', () => {
    const store = createSnapshotStore();
    let notifications = 0;

    store.update({ sceneId: SCENE_ID, loadProgress: 0.5 });
    const before = store.getSnapshot();

    store.subscribe(() => {
      notifications += 1;
    });
    store.update({ sceneId: SCENE_ID, loadProgress: 0.5 });

    assert.equal(store.getSnapshot(), before);
    assert.equal(notifications, 0);
  });

  it('изменение создаёт новый замороженный объект', () => {
    const store = createSnapshotStore();
    const before = store.getSnapshot();

    store.update({ status: EnumViewerStatus.Preview });

    assert.notEqual(store.getSnapshot(), before);
    assert.ok(Object.isFrozen(store.getSnapshot()));
    assert.equal(store.getSnapshot().status, 'preview');
  });
});

describe('viewer-state-events · Подписка на изменения', () => {
  it('React-хост: subscribe и getSnapshot работают без привязки контекста', () => {
    const { subscribe, getSnapshot, update } = createSnapshotStore();
    const statuses = [];
    const unsubscribe = subscribe(() => {
      statuses.push(getSnapshot().status);
    });

    update({ status: EnumViewerStatus.Preview });
    update({ status: EnumViewerStatus.Ready, loadProgress: 1 });
    unsubscribe();
    update({ status: EnumViewerStatus.Error });

    assert.deepEqual(statuses, ['preview', 'ready']);
  });
});

describe('viewer-state-events · Словари категорий, кодов и статусов', () => {
  it('Проверка статуса: константы словарей равны строковым значениям', () => {
    assert.deepEqual(Object.values(EnumViewerStatus), ['loading', 'preview', 'ready', 'error']);
    assert.deepEqual(Object.values(EnumErrorCategory), ['webgl', 'tour', 'resource', 'image']);
    assert.deepEqual(Object.values(EnumErrorCode), [
      'webgl-unavailable',
      'invalid-tour',
      'network-failed',
      'http-status',
      'decode-failed',
      'loader-failed',
      'invalid-image',
    ]);
  });

  it('каждый код относится к своей категории', () => {
    assert.deepEqual(ERROR_CATEGORY_BY_CODE, {
      'webgl-unavailable': 'webgl',
      'invalid-tour': 'tour',
      'network-failed': 'resource',
      'http-status': 'resource',
      'decode-failed': 'resource',
      'loader-failed': 'resource',
      'invalid-image': 'image',
    });
  });
});
