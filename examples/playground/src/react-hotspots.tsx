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

const FLOOR_Y = -1.5;
const FLOOR_FACING = { yaw: 0, pitch: 90 };

/**
 * Пины «товаров» через `<Hotspot>`: размонтирование убирает их, вращение панорамы их не перерисовывает.
 * Под каждым пином на полу лежит диск — поверхность `<Hotspot surface>`; объект `surface` создаётся в
 * каждом рендере, но источник не перезаливается, пока не сменился URL.
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
    {DEMO_PINS.map((pin) => (
      <Hotspot
        key={`${pin.id}-floor`}
        position={{ ...pin.position, y: FLOOR_Y }}
        scene={pin.scene}
        plane={{ width: 0.4, facing: FLOOR_FACING }}
        surface={{ image: '/surfaces/floor-spot.png' }}
      >
        <span className="surface-zone" data-react-surface />
      </Hotspot>
    ))}
  </>
);
