/**
 * Панорамы владельца не лежат в git (это клиентские рендеры), поэтому песочница знает только их
 * ожидаемые пути в `public/local/` и подсказывает, куда их положить, если файлов нет.
 */
export const LOCAL_ASSETS = {
  balcony: '/local/balcony.jpg',
  hotelRoom: '/local/hotel-room.png',
} as const;

/**
 * Файлы, которые делает `scripts/make-cube-faces.mjs` из локальных панорам: превью 1024×512 и грани куба с
 * именами граней neometria (`f`, `r`, `b`, `l`, `u`, `d`).
 */
export const GENERATED_ASSETS = {
  balconyPreview: '/local/balcony-preview.jpg',
  hotelRoomPreview: '/local/hotel-room-preview.jpg',
  balconyFaces: '/local/cube/balcony/{face}.jpg',
  hotelRoomFaces: '/local/cube/hotel-room/{face}.jpg',
} as const;

const LOCAL_ASSETS_FOLDER = 'examples/playground/public/local/';

const isImageResponse = (response: Response): boolean =>
  response.ok && (response.headers.get('content-type') ?? '').startsWith('image/');

const isAssetAvailable = async (url: string): Promise<boolean> => {
  try {
    return isImageResponse(await fetch(url, { method: 'HEAD' }));
  } catch {
    return false;
  }
};

/**
 * Возвращает пути недостающих файлов. Проверяется тип содержимого, а не только статус: dev-сервер
 * Vite на отсутствующий путь может ответить страницей приложения со статусом 200.
 */
export const findMissingLocalAssets = async (): Promise<string[]> => {
  const urls = Object.values(LOCAL_ASSETS);
  const availability = await Promise.all(urls.map(isAssetAvailable));

  return urls.filter((_url, index) => !availability[index]);
};

/**
 * Текст подсказки для разработчика без локальных панорам: какие файлы и в какую папку положить.
 */
export const describeMissingLocalAssets = (missingUrls: readonly string[]): string =>
  `Local panoramas are missing: ${missingUrls.join(', ')}. Put 2:1 equirectangular images into ${LOCAL_ASSETS_FOLDER} (the folder is ignored by git).`;
