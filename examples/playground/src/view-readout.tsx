import type { IView } from '@dkukushkin/3d-pano';
import type { IPanoViewer } from '@dkukushkin/3d-pano/react';
import { type ReactElement, useEffect, useRef } from 'react';

interface IViewReadoutProps {
  viewer: IPanoViewer | null;
}

const formatView = (view: IView): string =>
  `view yaw ${view.yaw.toFixed(1)} · pitch ${view.pitch.toFixed(1)} · fov ${view.fov.toFixed(1)}`;

/**
 * Показания камеры без перерисовок React: вид меняется каждый кадр, поэтому текст пишется прямо в узел
 * из события `viewChange`, а не через состояние, которое перерисовывало бы всю страницу при вращении.
 */
export const ViewReadout = ({ viewer }: IViewReadoutProps): ReactElement => {
  const outputRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (viewer === null) {
      return undefined;
    }

    const render = (view: IView): void => {
      if (outputRef.current !== null) {
        outputRef.current.textContent = formatView(view);
      }
    };

    render(viewer.getView());

    return viewer.on('viewChange', ({ view }) => {
      render(view);
    });
  }, [viewer]);

  return <span ref={outputRef}>view —</span>;
};
