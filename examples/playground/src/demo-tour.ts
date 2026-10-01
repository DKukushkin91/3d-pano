import { EnumSourceType, type ITour } from '@dkukushkin/3d-pano';

import { LOCAL_ASSETS } from './local-assets';

/**
 * Тур из двух локальных панорам владельца. Источники нарочно записаны по-разному — константой словаря и
 * строкой: проверка типов песочницы подтверждает, что обе формы равнозначны.
 */
export const DEMO_TOUR: ITour = {
  startScene: 'balcony',
  defaults: {
    view: { fov: 90 },
  },
  scenes: [
    {
      id: 'balcony',
      title: 'Balcony',
      source: { type: EnumSourceType.Equirect, url: LOCAL_ASSETS.balcony },
    },
    {
      id: 'hotel-room',
      title: 'Hotel room',
      source: { type: 'equirect', url: LOCAL_ASSETS.hotelRoom },
    },
  ],
};
