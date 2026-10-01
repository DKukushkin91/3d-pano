import { EnumSourceType, type ITour } from '@dkukushkin/3d-pano';

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
 * Тур из локальных панорам владельца: балкон одним файлом, номер одним файлом и тот же номер гранями
 * куба. Источники нарочно записаны по-разному — константой словаря и строкой: проверка типов песочницы
 * подтверждает, что обе формы равнозначны.
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
    },
    {
      id: 'hotel-room',
      title: 'Hotel room — one equirectangular file',
      source: { type: 'equirect', url: LOCAL_ASSETS.hotelRoom },
      preview: { type: EnumSourceType.Equirect, url: GENERATED_ASSETS.hotelRoomPreview },
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
    },
  ],
};

/**
 * Тур, который ломает \`validateTour\`: проверка «Сломанный тур с сервера» и «Ошибка видна сразу».
 */
export const BROKEN_TOUR_JSON = '{"startScene":"hall","scenes":[]}';
