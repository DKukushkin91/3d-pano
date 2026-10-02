import { EnumHotspotAnchor, type IHotspotHandle, type IPanoViewer } from '@dkukushkin/3d-pano';

import { DEMO_PINS } from './demo-hotspots';

/**
 * Пины «товаров» через `addHotspot`: карточка хоста — обычная ссылка, библиотека только держит её в точке
 * мира, и только в сцене пина. Возвращает объекты управления, чтобы страница могла убрать пины.
 */
export const addDemoPins = (viewer: IPanoViewer): IHotspotHandle[] =>
  DEMO_PINS.map((pin) => {
    const card = viewer.overlay.ownerDocument.createElement('a');

    card.className = 'pin-card';
    card.href = `#${pin.id}`;
    card.textContent = pin.name;

    return viewer.addHotspot({
      element: card,
      position: pin.position,
      scene: pin.scene,
      anchor: EnumHotspotAnchor.BottomLeft,
    });
  });
