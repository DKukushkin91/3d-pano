import type { TViewTarget } from '@dkukushkin/3d-pano';
import type { IPanoViewer } from '@dkukushkin/3d-pano/react';
import { type ReactElement, useEffect, useState } from 'react';

interface IPin {
  id: string;
  target: TViewTarget;
}

const PINS: readonly IPin[] = [
  { id: 'chair', target: { x: 1.5, y: -1.2, z: 2 } },
  { id: 'window', target: { yaw: -120, pitch: 10 } },
  { id: 'floor', target: { x: -2, y: -1.2, z: -1 } },
];

interface IPinFocusProps {
  viewer: IPanoViewer | null;
}

/**
 * «Пины» в координатах мира и сферы, как товары neometria. Поворот к выбранному пину идёт из эффекта:
 * очистка отменяет поворот через `AbortController`, поэтому смена пина или размонтирование не оставляют
 * камеру ехать к старой цели. Результат промиса виден на странице.
 */
export const PinFocus = ({ viewer }: IPinFocusProps): ReactElement => {
  const [pinId, setPinId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('—');

  useEffect(() => {
    const pin = PINS.find((candidate) => candidate.id === pinId);

    if (viewer === null || pin === undefined) {
      return undefined;
    }

    const controller = new AbortController();

    void viewer.lookAt(pin.target, { signal: controller.signal }).then((isReached) => {
      setOutcome(`${pin.id} → ${String(isReached)}`);
    });

    return () => {
      controller.abort();
    };
  }, [viewer, pinId]);

  return (
    <fieldset className="toolbar" data-pin-focus>
      <legend>Focus a pin (lookAt from an effect)</legend>
      {PINS.map((pin) => (
        <button
          key={pin.id}
          type="button"
          aria-pressed={pin.id === pinId}
          onClick={() => {
            setPinId(pin.id);
          }}
        >
          {pin.id}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setPinId(null);
        }}
      >
        none
      </button>
      <span data-pin-outcome>{outcome}</span>
    </fieldset>
  );
};
