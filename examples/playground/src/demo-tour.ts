import { EnumSourceType, type ITour } from '@dkukushkin/3d-pano';

import { balconyHotspots, roomHotspots } from './demo-hotspots';
import { GENERATED_ASSETS, LOCAL_ASSETS } from './local-assets';

/**
 * Имена граней, которые использует neometria, — проверяют `faceNames`.
 */
export const NEOMETRIA_FACE_NAMES = {
  front: 'f',
  right: 'r',
  back: 'b',
  left: 'l',
  up: 'u',
  down: 'd',
} as const;

/**
 * Тур из локальных панорам владельца: балкон и номер — каждый одним файлом и гранями куба. Пара «файл ↔
 * грани» одного снимка — это «смена ремонта»: при смешивании с `view: 'keep'` смена должна быть
 * незаметной. Точки на полу ведут из балкона в номер и обратно внутри одного варианта. Источники нарочно записаны по-разному — константой словаря и строкой: проверка типов
 * песочницы подтверждает, что обе формы равнозначны.
 */
export const DEMO_TOUR: ITour = {
  startScene: 'balcony',
  defaults: {
    view: { fov: 90 },
  },
  scenes: [
    {
      id: 'balcony',
      title: 'Balcony — one equirectangular file',
      source: { type: EnumSourceType.Equirect, url: LOCAL_ASSETS.balcony },
      preview: { type: 'equirect', url: GENERATED_ASSETS.balconyPreview },
      hotspots: balconyHotspots('hotel-room'),
    },
    {
      id: 'balcony-cube',
      title: 'Balcony — six cube faces',
      source: { type: 'cube', url: GENERATED_ASSETS.balconyFaces, faceNames: NEOMETRIA_FACE_NAMES },
      preview: { type: 'equirect', url: GENERATED_ASSETS.balconyPreview },
      hotspots: balconyHotspots('hotel-room-cube'),
    },
    {
      id: 'hotel-room',
      title: 'Hotel room — one equirectangular file',
      source: { type: 'equirect', url: LOCAL_ASSETS.hotelRoom },
      preview: { type: EnumSourceType.Equirect, url: GENERATED_ASSETS.hotelRoomPreview },
      hotspots: roomHotspots('balcony'),
    },
    {
      id: 'hotel-room-cube',
      title: 'Hotel room — six cube faces',
      source: {
        type: EnumSourceType.Cube,
        url: GENERATED_ASSETS.hotelRoomFaces,
        faceNames: NEOMETRIA_FACE_NAMES,
      },
      preview: { type: 'equirect', url: GENERATED_ASSETS.hotelRoomPreview },
      hotspots: roomHotspots('balcony-cube'),
    },
  ],
};

/**
 * Тот же тур с другими ограничениями: узкие пределы FOV видны сразу. Им проверяется замена тура без
 * пересоздания просмотрщика («Новый вариант планировки»).
 */
export const NARROW_FOV_TOUR: ITour = {
  ...DEMO_TOUR,
  defaults: { view: { fov: 70 }, limits: { fov: [50, 80] } },
};

/**
 * Тур, который ломает \`validateTour\`: проверка «Сломанный тур с сервера» и «Ошибка видна сразу».
 */
export const BROKEN_TOUR_JSON = '{"startScene":"hall","scenes":[]}';
