import { useEffect, useRef } from 'react';

import type { IShowSceneOptions } from '../navigation/navigation-types';
import { reportHostError } from '../state/report-error';
import { EnumErrorCategory } from '../state/viewer-dictionaries';
import type { IPanoError } from '../state/viewer-state-types';
import type { ITour } from '../tour/tour-types';
import type { IPanoViewer } from '../viewer/viewer-types';

/**
 * Пропсы сцены: `scene` применяется при изменении своего значения с `sceneOptions` того же рендера.
 */
export interface IPanoViewerSceneProps {
  scene?: string;
  sceneOptions?: IShowSceneOptions;
}

interface IAppliedScene {
  viewer: IPanoViewer | null;
  tourJson: string;
  scene: string | undefined;
}

const hasErrorDetails = (details: unknown): details is IPanoError =>
  typeof details === 'object' && details !== null && 'category' in details;

const isViewerRejection = (error: unknown): error is Error & { details: IPanoError } =>
  error instanceof Error && 'details' in error && hasErrorDetails(error.details);

const reportRejection = (
  error: unknown,
  onError: ((payload: { error: IPanoError }) => void) | undefined,
): void => {
  if (!isViewerRejection(error)) {
    reportHostError(error);

    return;
  }

  if (error.details.category !== EnumErrorCategory.Tour) {
    return;
  }

  if (onError === undefined) {
    reportHostError(error);
  } else {
    onError({ error: error.details });
  }
};

/**
 * Тур, с которым создаётся просмотрщик: проп `scene` становится стартовой сценой, чтобы не загружать
 * лишний раз `startScene` тура.
 */
export const tourWithStartScene = (tour: ITour, scene: string | undefined): ITour =>
  scene === undefined ? tour : { ...tour, startScene: scene };

/**
 * Применяет `scene` и `tour` к работающему просмотрщику. Тур сравнивается по содержимому (JSON), поэтому
 * его можно собирать прямо в рендере. Смена `tour` и `scene` в одном рендере — один `setTour`. Отклонения
 * данных (`unknown-scene`, `invalid-tour`) уходят в `onError` — у React-хоста нет промиса, — а ошибки
 * загрузки уже приходят событием и не дублируются.
 */
export const useSceneSync = (
  viewer: IPanoViewer | null,
  tour: ITour,
  { scene, sceneOptions }: IPanoViewerSceneProps,
  readOnError: () => ((payload: { error: IPanoError }) => void) | undefined,
): void => {
  const applied = useRef<IAppliedScene>({ viewer: null, tourJson: '', scene: undefined });

  useEffect(() => {
    const tourJson = JSON.stringify(tour);
    const previous = applied.current;

    applied.current = { viewer, tourJson, scene };

    if (viewer === null || previous.viewer !== viewer) {
      return;
    }

    const handleRejection = (error: unknown): void => {
      reportRejection(error, readOnError());
    };

    if (tourJson !== previous.tourJson) {
      viewer.setTour(tour, { ...sceneOptions, scene }).catch(handleRejection);
    } else if (scene !== undefined && scene !== previous.scene) {
      viewer.showScene(scene, sceneOptions).catch(handleRejection);
    }
  });
};
