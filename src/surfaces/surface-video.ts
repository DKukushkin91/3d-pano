/**
 * Новые кадры видео для поверхности. `takeNewFrame` — есть ли кадр, который ещё не залит; `isPolling` —
 * браузер не умеет сообщать о кадрах, и цикл отрисовки должен крутиться, пока видео играет.
 */
export interface IVideoFrames {
  takeNewFrame: () => boolean;
  isPolling: () => boolean;
}

const HAVE_CURRENT_DATA = 2;

const hasCurrentFrame = (video: HTMLVideoElement): boolean => video.readyState >= HAVE_CURRENT_DATA;

const isFrameCallbackSupported = (video: HTMLVideoElement): boolean => 'requestVideoFrameCallback' in video;

/**
 * Следит за кадрами видео до отмены `signal`. Где есть `requestVideoFrameCallback`, кадр заливается только
 * тогда, когда браузер показал новый, а `onFrame` просит кадр отрисовки — цикл по требованию не крутится
 * впустую. Без него кадр заливается каждый кадр отрисовки, пока видео играет.
 */
export const watchVideoFrames = (
  video: HTMLVideoElement,
  onFrame: () => void,
  signal: AbortSignal,
): IVideoFrames => {
  if (!isFrameCallbackSupported(video)) {
    return {
      takeNewFrame: () => !video.paused && hasCurrentFrame(video),
      isPolling: () => !video.paused,
    };
  }

  let hasNewFrame = false;
  let request = 0;

  const handleFrame = (): void => {
    hasNewFrame = true;
    onFrame();
    request = video.requestVideoFrameCallback(handleFrame);
  };

  request = video.requestVideoFrameCallback(handleFrame);
  signal.addEventListener(
    'abort',
    () => {
      video.cancelVideoFrameCallback(request);
    },
    { once: true },
  );

  return {
    takeNewFrame: () => {
      const isNew = hasNewFrame && hasCurrentFrame(video);

      hasNewFrame = false;

      return isNew;
    },
    isPolling: () => false,
  };
};

/**
 * Ждёт, пока у видео появится текущий кадр. Ошибка загрузки отклоняет промис — поверхность молча не
 * рисуется; отмена `signal` снимает слушатели.
 */
export const waitForVideoData = (video: HTMLVideoElement, signal: AbortSignal): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    if (hasCurrentFrame(video)) {
      resolve(video);

      return;
    }

    const controller = new AbortController();
    const listening = { signal: controller.signal };

    video.addEventListener(
      'loadeddata',
      () => {
        controller.abort();
        resolve(video);
      },
      listening,
    );
    video.addEventListener(
      'error',
      () => {
        controller.abort();
        reject(new Error('3d-pano: the surface video could not be loaded'));
      },
      listening,
    );
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  });

/**
 * Видео поверхности из тура: без звука, по кругу, без полноэкранного режима и с CORS, чтобы WebGL мог
 * читать кадры. Запускается сразу; если браузер запретил автозапуск, видна первая картинка. Отмена
 * `signal` (сцена ушла и переход закончился) ставит его на паузу и отпускает файл.
 */
export const createTourVideo = (
  ownerDocument: Document,
  url: string,
  signal: AbortSignal,
): Promise<HTMLVideoElement> => {
  const video = ownerDocument.createElement('video');

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.src = url;
  signal.addEventListener(
    'abort',
    () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
    { once: true },
  );
  video.play().catch(() => undefined);

  return waitForVideoData(video, signal);
};
