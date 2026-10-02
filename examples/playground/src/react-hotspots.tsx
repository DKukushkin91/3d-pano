import { EnumHotspotAnchor, type IHotspot } from '@dkukushkin/3d-pano';
import { Hotspot } from '@dkukushkin/3d-pano/react';
import type { ReactElement, ReactNode } from 'react';

import { DEMO_PINS } from './demo-hotspots';

const isFloorSpot = (hotspot: IHotspot): boolean => hotspot.target !== undefined;

/**
 * Своя отрисовка хотспотов тура на React-странице: точка на полу — кнопка-диск, подпись — плашка.
 * Клик и переход по-прежнему обрабатывает библиотека.
 */
export const renderDemoHotspot = (hotspot: IHotspot): ReactNode =>
  isFloorSpot(hotspot) ? (
    <button type="button" className="floor-spot" aria-label={hotspot.title ?? hotspot.id} data-floor-spot />
  ) : (
    <span className="info-spot">{hotspot.title}</span>
  );

/**
 * Пины «товаров» через `<Hotspot>`: размонтирование убирает их, вращение панорамы их не перерисовывает.
 */
export const DemoPins = (): ReactElement => (
  <>
    {DEMO_PINS.map((pin) => (
      <Hotspot key={pin.id} position={pin.position} scene={pin.scene} anchor={EnumHotspotAnchor.BottomLeft}>
        <a className="pin-card" href={`#${pin.id}`} data-react-pin>
          {pin.name}
        </a>
      </Hotspot>
    ))}
  </>
);
