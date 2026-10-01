import type { IShowSceneOptions } from '@dkukushkin/3d-pano';
import type { MouseEvent, ReactElement } from 'react';

/**
 * Переходы как в neometria: смена ремонта — короткое смешивание с сохранением вида и инерции, смена
 * комнаты — более длинное со стартовым видом сцены.
 */
export const VARIANT_SWITCH: IShowSceneOptions = {
  transition: { type: 'blend', durationMs: 300, easing: 'sine-in-out' },
  view: 'keep',
  keepMotion: true,
};

export const ROOM_SWITCH: IShowSceneOptions = { transition: { type: 'blend', durationMs: 800 } };

const ROOMS = [
  { id: 'balcony', variants: ['balcony', 'balcony-cube'] },
  { id: 'hotel-room', variants: ['hotel-room', 'hotel-room-cube'] },
] as const;

interface IScenePickerProps {
  scene: string;
  onPick: (sceneId: string, options: IShowSceneOptions) => void;
}

const roomOf = (sceneId: string): string | undefined =>
  ROOMS.find((room) => room.variants.some((variant) => variant === sceneId))?.id;

/**
 * Список комнат и вариантов ремонта на пропе `scene`: комната — `ROOM_SWITCH`, вариант той же комнаты —
 * `VARIANT_SWITCH`. Кнопки размечены `data-*`, поэтому обработчик один и без инлайн-стрелок.
 */
export const ScenePicker = ({ scene, onPick }: IScenePickerProps): ReactElement => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    const target = event.currentTarget.dataset.pick;

    if (target !== undefined) {
      onPick(target, roomOf(target) === roomOf(scene) ? VARIANT_SWITCH : ROOM_SWITCH);
    }
  };

  return (
    <fieldset className="toolbar">
      <legend>Rooms and renovations (scene prop)</legend>
      {ROOMS.map((room) =>
        room.variants.map((variant) => (
          <button
            key={variant}
            type="button"
            onClick={handleClick}
            data-pick={variant}
            aria-pressed={variant === scene}
          >
            {variant}
          </button>
        )),
      )}
    </fieldset>
  );
};
