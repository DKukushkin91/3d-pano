import type { IHotspotHandle, IPanoViewer, ITour } from '@dkukushkin/3d-pano';

const ROOM_SCENE = 'hotel-room';
const BALCONY_SCENES = new Set(['balcony', 'balcony-cube', 'balcony-tiles']);
const SIGN_WIDTH_PIXELS = 256;
const SIGN_HEIGHT_PIXELS = 128;
const RUG_CELLS = 8;
const RUG_CELL_PIXELS = 32;
const SCREEN_WIDTH_PIXELS = 320;
const SCREEN_HEIGHT_PIXELS = 180;
const SCREEN_FRAME_MS = 33;
const SCREEN_FPS = 30;
const CLIP_DURATION_MS = 2000;
const SIGNS_POINT = { x: 1.6, y: -0.5, z: 1.4 };
const ZONE_CLASS = 'surface-zone';
const CLIP_TYPE = 'video/webm';

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = width;
  canvas.height = height;

  return canvas;
};

const context2d = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
  const context = canvas.getContext('2d');

  if (context === null) {
    throw new Error('playground: 2d canvas is not available');
  }

  return context;
};

const drawSign = (color: string, text: string): HTMLCanvasElement => {
  const canvas = createCanvas(SIGN_WIDTH_PIXELS, SIGN_HEIGHT_PIXELS);
  const context = context2d(canvas);

  context.fillStyle = color;
  context.fillRect(0, 0, SIGN_WIDTH_PIXELS, SIGN_HEIGHT_PIXELS);
  context.fillStyle = '#fff';
  context.font = 'bold 56px sans-serif';
  context.fillText(text, 24, 84);

  return canvas;
};

const drawRug = (): HTMLCanvasElement => {
  const size = RUG_CELLS * RUG_CELL_PIXELS;
  const canvas = createCanvas(size, size);
  const context = context2d(canvas);

  for (let row = 0; row < RUG_CELLS; row += 1) {
    for (let column = 0; column < RUG_CELLS; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? '#c9a227' : '#6c3483';
      context.fillRect(column * RUG_CELL_PIXELS, row * RUG_CELL_PIXELS, RUG_CELL_PIXELS, RUG_CELL_PIXELS);
    }
  }

  return canvas;
};

const animateScreen = (label: string): { canvas: HTMLCanvasElement; stop: () => void } => {
  const canvas = createCanvas(SCREEN_WIDTH_PIXELS, SCREEN_HEIGHT_PIXELS);
  const context = context2d(canvas);
  let frame = 0;
  const timer = window.setInterval(() => {
    frame += 1;
    context.fillStyle = `hsl(${String((frame * 6) % 360)} 60% 40%)`;
    context.fillRect(0, 0, SCREEN_WIDTH_PIXELS, SCREEN_HEIGHT_PIXELS);
    context.fillStyle = '#fff';
    context.font = 'bold 48px sans-serif';
    context.fillText(`${label} ${String(frame)}`, 24, 108);
  }, SCREEN_FRAME_MS);

  return { canvas, stop: () => window.clearInterval(timer) };
};

const zone = (className: string, label: string): HTMLButtonElement => {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);

  return button;
};

const addHostVideo = (viewer: IPanoViewer): IHotspotHandle => {
  const screen = animateScreen('Host');
  const video = document.createElement('video');
  const toggle = zone(`${ZONE_CLASS} ${ZONE_CLASS}--wide`, 'Play or pause the screen');

  video.muted = true;
  video.playsInline = true;
  video.srcObject = screen.canvas.captureStream(SCREEN_FPS);
  void video.play();
  toggle.addEventListener('click', () => {
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  });

  const handle = viewer.addHotspot({
    element: toggle,
    position: { yaw: 100, pitch: 14 },
    scene: ROOM_SCENE,
    plane: { width: 0.5 },
    surface: { video },
  });

  return {
    ...handle,
    remove: () => {
      handle.remove();
      screen.stop();
      video.pause();
    },
  };
};

/**
 * Поверхности хоста в номере: две таблички из `<canvas>` крест-накрест, ковёр под камерой и экран —
 * `<video>` хоста с потоком из анимации на `<canvas>` (цветной фон со счётчиком кадров); нажатие на экран
 * ставит его на паузу и запускает снова.
 */
export const addSurfaceDemo = (viewer: IPanoViewer): IHotspotHandle[] => [
  viewer.addHotspot({
    element: zone(ZONE_CLASS, 'Spa'),
    position: SIGNS_POINT,
    scene: ROOM_SCENE,
    plane: { width: 0.8, facing: { yaw: 183, pitch: 0 } },
    surface: { image: drawSign('#c0392b', 'Spa') },
  }),
  viewer.addHotspot({
    element: zone(ZONE_CLASS, 'Gym'),
    position: SIGNS_POINT,
    scene: ROOM_SCENE,
    plane: { width: 0.8, facing: { yaw: 273, pitch: 0 } },
    surface: { image: drawSign('#2471a3', 'Gym') },
  }),
  viewer.addHotspot({
    element: zone(ZONE_CLASS, 'Rug'),
    position: { x: 0, y: -1.5, z: 0.3 },
    scene: ROOM_SCENE,
    plane: { width: 2, facing: { yaw: 0, pitch: 90 } },
    surface: { image: drawRug() },
  }),
  addHostVideo(viewer),
];

/**
 * Записывает двухсекундный ролик из анимации на `<canvas>` и отдаёт его `blob:` URL — так у видео тура есть
 * настоящий файл без бинарных ассетов в репозитории. `null` — браузер не умеет записывать WebM.
 */
export const recordDemoClip = async (): Promise<string | null> => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported(CLIP_TYPE)) {
    return null;
  }

  const screen = animateScreen('Tour');
  const recorder = new MediaRecorder(screen.canvas.captureStream(SCREEN_FPS), { mimeType: CLIP_TYPE });
  const chunks: Blob[] = [];
  const stopped = new Promise((resolve) => {
    recorder.addEventListener('stop', resolve, { once: true });
  });

  recorder.addEventListener('dataavailable', (event) => {
    chunks.push(event.data);
  });
  recorder.start();
  await new Promise((resolve) => {
    window.setTimeout(resolve, CLIP_DURATION_MS);
  });
  recorder.stop();
  await stopped;
  screen.stop();

  return URL.createObjectURL(new Blob(chunks, { type: CLIP_TYPE }));
};

/**
 * Тур с видео-экраном на балконе: хотспот тура с `surface: { video }` — его запускает сама библиотека.
 */
export const withTourVideo = (tour: ITour, videoUrl: string): ITour => ({
  ...tour,
  scenes: tour.scenes.map((scene) =>
    BALCONY_SCENES.has(scene.id)
      ? {
          ...scene,
          hotspots: [
            ...(scene.hotspots ?? []),
            {
              id: 'tour-screen',
              position: { yaw: -100, pitch: 12 },
              title: 'Tour video',
              plane: { width: 0.6 },
              surface: { video: videoUrl },
            },
          ],
        }
      : scene,
  ),
});
