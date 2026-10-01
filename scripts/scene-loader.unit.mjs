import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EnumErrorCategory,
  EnumErrorCode,
  EnumImageRole,
  EnumSourceType,
  createSceneLoader,
  listSceneImages,
} from '../dist/internal.js';
import { FACE_URL, IMAGE_URL, fakeImage, networkError, rejectionOf } from './test-helpers.mjs';

const PREVIEW_WIDTH = 512;
const FACE_SIZE = 1024;

const cubeScene = {
  id: 'kitchen',
  source: { type: EnumSourceType.Cube, url: FACE_URL, faceNames: { front: 'f' } },
  preview: { type: EnumSourceType.Equirect, url: IMAGE_URL },
};

const imageForUrl = (url) =>
  url === IMAGE_URL ? fakeImage(PREVIEW_WIDTH, PREVIEW_WIDTH / 2) : fakeImage(FACE_SIZE);

const runLoader = (scene, imageFor) => {
  const events = [];
  const loader = createSceneLoader({
    scene,
    loadImage: async (url) => imageFor(url),
    onImage: ({ role, layerIndex }) => events.push(`${role}:${String(layerIndex)}`),
    onProgress: (progress) => events.push(Number(progress.toFixed(3))),
  });

  return { loader, events };
};

describe('panorama-sources · Загрузка сцены', () => {
  it('сначала превью, затем шесть граней основного источника', async () => {
    const { loader, events } = runLoader(cubeScene, (url) =>
      fakeImage(url === IMAGE_URL ? 512 : 1024, url === IMAGE_URL ? 256 : 1024),
    );

    await loader.load();

    assert.equal(events[0], 'preview:0');
    assert.equal(events.filter((event) => typeof event === 'string' && event.startsWith('main:')).length, 6);
    assert.equal(events.at(-1), 1);
  });

  it('listSceneImages подставляет имена граней в порядке слоёв', () => {
    const { preview, main } = listSceneImages(cubeScene);

    assert.deepEqual(
      preview.map(({ role }) => role),
      [EnumImageRole.Preview],
    );
    assert.equal(main[0].url, 'https://cdn.example.com/tiles/kitchen/f.jpg');
    assert.equal(main[4].url, 'https://cdn.example.com/tiles/kitchen/up.jpg');
  });

  it('Неквадратная грань: invalid-image с URL этой грани, изображение освобождается', async () => {
    const wide = fakeImage(1024, 512);
    const { loader } = runLoader(cubeScene, (url) => (url.endsWith('/back.jpg') ? wide : imageForUrl(url)));
    const error = await rejectionOf(loader.load());

    assert.equal(error.details.category, EnumErrorCategory.Image);
    assert.equal(error.details.code, EnumErrorCode.InvalidImage);
    assert.equal(error.details.url, 'https://cdn.example.com/tiles/kitchen/back.jpg');
    assert.equal(wide.isClosed, true);
  });

  it('Кнопка «Повторить»: повторный load() догружает только недостающую грань', async () => {
    const requested = [];
    let isOffline = true;
    const loader = createSceneLoader({
      scene: cubeScene,
      loadImage: async (url) => {
        requested.push(url);

        if (isOffline && url.endsWith('/left.jpg')) {
          throw networkError(url);
        }

        return imageForUrl(url);
      },
      onImage: () => undefined,
      onProgress: () => undefined,
    });

    const error = await rejectionOf(loader.load());

    assert.equal(error.details.url, 'https://cdn.example.com/tiles/kitchen/left.jpg');
    assert.equal(requested.length, 7, 'остальные грани загружаются несмотря на сбой одной');

    isOffline = false;
    requested.length = 0;
    await loader.load();

    assert.deepEqual(requested, ['https://cdn.example.com/tiles/kitchen/left.jpg']);
  });

  it('после abort загруженные изображения освобождаются и не передаются дальше', async () => {
    const images = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const loader = createSceneLoader({
      scene: { id: 'room', source: { type: EnumSourceType.Equirect, url: IMAGE_URL } },
      loadImage: async () => {
        await gate;
        const image = fakeImage(2048, 1024);

        images.push(image);

        return image;
      },
      onImage: () => assert.fail('onImage must not be called after abort'),
      onProgress: () => undefined,
    });
    const loading = loader.load();

    loader.abort();
    release();
    await loading;

    assert.equal(images[0].isClosed, true);
  });
});
