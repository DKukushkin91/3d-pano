import { EnumHotspotAnchor, type IHotspot } from '@dkukushkin/3d-pano';

const FLOOR_Y = -1.5;
const FLOOR_SPOT_WIDTH = 0.5;
const ROOM_TRANSITION = { type: 'move' } as const;

const floorSpot = (id: string, x: number, z: number, scene: string, title: string): IHotspot => ({
  id,
  position: { x, y: FLOOR_Y, z },
  title,
  target: { scene, transition: ROOM_TRANSITION },
  plane: { width: FLOOR_SPOT_WIDTH, facing: { yaw: 0, pitch: 90 } },
  data: { kind: 'floor' },
});

/**
 * Хотспоты балкона: точка на полу у двери в номер (позади камеры) и подпись «вид на море». Вариант
 * гранями ведёт в номер гранями — так переход остаётся внутри одного «ремонта».
 */
export const balconyHotspots = (roomScene: string): IHotspot[] => [
  floorSpot('to-room', 0, -1.4, roomScene, 'Hotel room'),
  {
    id: 'sea',
    position: { yaw: -60, pitch: 2 },
    title: 'Sea view',
    anchor: EnumHotspotAnchor.Bottom,
    data: { kind: 'info' },
  },
];

/**
 * Хотспоты номера: точка на полу перед выходом на балкон (около `yaw` 175).
 */
export const roomHotspots = (balconyScene: string): IHotspot[] => [
  floorSpot('to-balcony', 0.2, -2.5, balconyScene, 'Balcony'),
];

/**
 * Пины «товаров» в координатах мира для `addHotspot` и `<Hotspot>`: каждый показан только в своей сцене.
 */
export interface IDemoPin {
  id: string;
  name: string;
  scene: string;
  position: { x: number; y: number; z: number };
}

export const DEMO_PINS: readonly IDemoPin[] = [
  { id: 'loungers', name: 'Sun loungers', scene: 'balcony', position: { x: -5.7, y: -3.2, z: 12.4 } },
  { id: 'armchair', name: 'Armchair', scene: 'hotel-room', position: { x: 0.75, y: -0.9, z: -1.3 } },
];
