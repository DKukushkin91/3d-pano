import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

const TOUR = { scenes: [{ id: 'room', source: { type: 'equirect', url: '/room.jpg' } }] };

describe('react-adapter · Серверный рендеринг', () => {
  it('выполняется без DOM', () => {
    assert.equal(globalThis.window, undefined);
    assert.equal(globalThis.document, undefined);
  });

  it('точки входа ядра и React импортируются без DOM', async () => {
    const core = await import('../dist/index.js');
    const react = await import('../dist/react.js');

    assert.equal(typeof core.createPanoViewer, 'function');
    assert.equal(typeof react.PanoViewer, 'object');
    assert.equal(typeof react.usePanoViewer, 'function');
    assert.equal(typeof react.usePanoSnapshot, 'function');
  });

  it("'use client' только в react.js, чанки ядра не импортируют React", async () => {
    const distUrl = new URL('../dist/', import.meta.url);
    const reactEntry = await readFile(new URL('react.js', distUrl), 'utf8');
    const [firstLine] = reactEntry.split('\n');

    assert.match(firstLine ?? '', /^["']use client["'];?$/);

    const fileNames = (await readdir(distUrl)).filter(
      (fileName) => fileName.endsWith('.js') && fileName !== 'react.js',
    );
    const sources = await Promise.all(
      fileNames.map((fileName) => readFile(new URL(fileName, distUrl), 'utf8')),
    );

    sources.forEach((source, index) => {
      const fileName = fileNames[index];

      assert.ok(!source.includes('use client'), `${String(fileName)} must not carry the client directive`);
      assert.ok(!/from\s*["']react(?:-dom)?["']/.test(source), `${String(fileName)} must not import React`);
    });
  });

  it('Next.js: разметка PanoViewer — пустой div и не зависит от поведенческих пропсов', async () => {
    const { PanoViewer } = await import('../dist/react.js');
    const render = (props) =>
      renderToString(
        createElement(PanoViewer, { tour: TOUR, label: 'Room', className: 'viewer', ...props }, 'overlay'),
      );
    const markup = render({});

    assert.equal(markup, '<div class="viewer"></div>');
    assert.equal(
      render({
        controls: { wheel: false },
        maxPixelRatio: 1,
        renderScale: 0.5,
        sceneCacheMegabytes: 64,
        scene: 'room',
        sceneOptions: { transition: { type: 'blend', durationMs: 300 }, view: 'keep' },
        onSceneReady: () => undefined,
        onSceneChange: () => undefined,
      }),
      markup,
    );
  });

  it('хотспоты на сервере: Hotspot и renderHotspot не рисуют ничего и не трогают DOM', async () => {
    const { Hotspot, PanoViewer } = await import('../dist/react.js');
    const markup = renderToString(
      createElement(
        PanoViewer,
        {
          tour: TOUR,
          label: 'Room',
          className: 'viewer',
          renderHotspot: (hotspot) => createElement('span', null, hotspot.id),
          onHotspotClick: () => undefined,
        },
        createElement(Hotspot, { position: { yaw: 10, pitch: 0 }, className: 'pin' }, 'Chair'),
      ),
    );

    assert.equal(markup, '<div class="viewer"></div>');
    assert.equal(renderToString(createElement(Hotspot, { position: { x: 1, y: 0, z: 1 } }, 'Lamp')), '');
  });

  it('usePanoSnapshot на сервере и без просмотрщика возвращает начальный снимок', async () => {
    const { usePanoSnapshot } = await import('../dist/react.js');
    const Status = () => createElement('span', null, usePanoSnapshot(null).status);

    assert.equal(renderToString(createElement(Status)), '<span>loading</span>');
  });
});
