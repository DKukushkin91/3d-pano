import { EnumViewerStatus, type ITour } from '@dkukushkin/3d-pano';
import { usePanoViewer } from '@dkukushkin/3d-pano/react';
import { type ReactElement, useState } from 'react';

interface IOwnMarkupDemoProps {
  tour: ITour;
}

/**
 * Хук со своей разметкой: контейнер — обычный `div` хоста, статус берётся из снимка.
 */
export const OwnMarkupDemo = ({ tour }: IOwnMarkupDemoProps): ReactElement => {
  const [readySceneId, setReadySceneId] = useState<string | null>(null);

  const handleSceneReady = ({ sceneId }: { sceneId: string }): void => {
    setReadySceneId(sceneId);
  };

  const { containerRef, snapshot } = usePanoViewer({
    tour,
    label: 'Balcony with own markup',
    onSceneReady: handleSceneReady,
  });

  return (
    <section>
      <h2>usePanoViewer</h2>
      <div ref={containerRef} className="viewer viewer--small" data-own-markup />
      <p data-own-markup-status>
        status {snapshot.status}
        {snapshot.status === EnumViewerStatus.Ready ? ' ✓' : ''}
      </p>
      <p data-own-markup-ready>sceneReady {readySceneId ?? '—'}</p>
    </section>
  );
};
