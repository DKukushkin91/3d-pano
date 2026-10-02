import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { createViewerHotspots } from '../dist/internal.js';

const POSITION = { x: 1, y: -1.5, z: 2 };
const PLANE = { width: 0.5, facing: { yaw: 0, pitch: 90 } };
const SPOT = { image: '/surfaces/floor-spot.png', width: 0.125 };
const SURFACE_ATTRIBUTE = 'data-pano-surface';

/**
 * Минимальный DOM для слоя хотспотов: стиль, data-атрибуты, атрибуты, дерево и слушатели без событий.
 */
class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.style = {};
    this.dataset = {};
    this.attributes = new Set();
    this.parentElement = null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
    }
  }

  prepend(node) {
    node.parentElement = this;
  }

  remove() {
    this.parentElement = null;
  }

  addEventListener() {}

  toggleAttribute(name, isPresent) {
    if (isPresent) {
      this.attributes.add(name);
    } else {
      this.attributes.delete(name);
    }

    return isPresent;
  }
}

const createDocument = () => {
  const ownerDocument = { createElement: () => new FakeElement(ownerDocument) };

  return ownerDocument;
};

/**
 * Поддельный слой поверхностей: запоминает добавленные хотспоты и вызовы `update` и `remove`.
 */
const createSurfaceSpy = () => {
  const spy = { added: [], updates: [], removed: 0 };

  spy.layer = {
    add: (hotspot) => {
      spy.added.push(hotspot);

      return {
        update: (next, isSurfaceSet) => {
          spy.updates.push({ next, isSurfaceSet });
        },
        remove: () => {
          spy.removed += 1;
        },
      };
    },
    frame: () => ({ current: [], previous: [], isAnimating: false }),
    dispose: () => undefined,
  };

  return spy;
};

const createHotspots = (surfaces) => {
  const overlay = new FakeElement(createDocument());

  return createViewerHotspots({
    overlay,
    surfaces,
    camera: { project: () => null, frameCamera: () => null, getViewport: () => ({ width: 1, height: 1 }) },
    requestFrame: () => undefined,
    emitter: { emit: () => undefined },
    showScene: () => Promise.resolve(true),
    preloadScene: () => Promise.resolve(true),
    lookAt: () => undefined,
  });
};

describe('hotspots · Хотспоты хоста (поверхность)', () => {
  const originalElement = globalThis.HTMLElement;

  beforeEach(() => {
    globalThis.HTMLElement = FakeElement;
  });

  afterEach(() => {
    globalThis.HTMLElement = originalElement;
  });

  it('Видео на стене: поверхность хотспота уходит в слой поверхностей, контейнер отмечен атрибутом', () => {
    const spy = createSurfaceSpy();
    const element = new FakeElement(createDocument());

    createHotspots(spy.layer).addHotspot({ element, position: POSITION, plane: PLANE, surface: SPOT });

    const [added] = spy.added;

    assert.deepEqual(added.surface, { kind: 'image', source: SPOT.image, width: SPOT.width });
    assert.equal(element.parentElement.parentElement.attributes.has(SURFACE_ATTRIBUTE), true);
  });

  it('без plane атрибута нет, а setPlane добавляет его', () => {
    const spy = createSurfaceSpy();
    const element = new FakeElement(createDocument());
    const handle = createHotspots(spy.layer).addHotspot({ element, position: POSITION, surface: SPOT });
    const container = element.parentElement.parentElement;

    assert.equal(container.attributes.has(SURFACE_ATTRIBUTE), false);
    handle.setPlane(PLANE);
    assert.equal(container.attributes.has(SURFACE_ATTRIBUTE), true);
    assert.equal(spy.updates.at(-1).isSurfaceSet, false);
    assert.deepEqual(spy.updates.at(-1).next.plane, { width: 0.5, facing: PLANE.facing, spin: 0 });
  });

  it('setSurface передаёт хотспот целиком с признаком явной поверхности; undefined убирает её', () => {
    const spy = createSurfaceSpy();
    const handle = createHotspots(spy.layer).addHotspot({
      element: new FakeElement(createDocument()),
      position: POSITION,
      plane: PLANE,
    });

    handle.setSurface({ video: '/tv.mp4' });
    assert.equal(spy.updates.at(-1).isSurfaceSet, true);
    assert.deepEqual(spy.updates.at(-1).next.surface, { kind: 'video', source: '/tv.mp4', width: null });
    assert.deepEqual(spy.updates.at(-1).next.position, POSITION);

    handle.setSurface(undefined);
    assert.equal(spy.updates.at(-1).next.surface, null);
  });

  it('setSurface проверяет аргумент и после remove, но ничего не меняет', () => {
    const spy = createSurfaceSpy();
    const handle = createHotspots(spy.layer).addHotspot({
      element: new FakeElement(createDocument()),
      position: POSITION,
      plane: PLANE,
    });

    assert.throws(() => handle.setSurface({ ...SPOT, width: 0 }), {
      name: 'RangeError',
      message: /surface\.width/u,
    });

    handle.remove();
    assert.equal(spy.removed, 1);
    assert.throws(() => handle.setSurface({ image: 42 }), { name: 'RangeError', message: /surface\.image/u });

    const updatesBefore = spy.updates.length;

    handle.setSurface(SPOT);
    assert.equal(spy.updates.length, updatesBefore);
  });

  it('без WebGL слоя поверхностей нет, и хотспот с поверхностью работает как раньше', () => {
    const element = new FakeElement(createDocument());
    const handle = createHotspots(null).addHotspot({
      element,
      position: POSITION,
      plane: PLANE,
      surface: SPOT,
    });

    handle.setSurface(undefined);
    handle.remove();
    assert.equal(element.parentElement.parentElement.attributes.has(SURFACE_ATTRIBUTE), false);
  });
});
