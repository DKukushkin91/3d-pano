import { EnumViewerStatus, type ITour } from '@dkukushkin/3d-pano';
import { usePanoViewer } from '@dkukushkin/3d-pano/react';
import type { ReactElement } from 'react';

interface IOwnMarkupDemoProps {
  tour: ITour;
}

/**
 * Хук со своей разметкой: контейнер — обычный `div` хоста, статус берётся из снимка.
 */
export const OwnMarkupDemo = ({ tour }: IOwnMarkupDemoProps): ReactElement => {
  const { containerRef, snapshot } = usePanoViewer({ tour, label: 'Balcony with own markup' });

  return (
    <section>
      <h2>usePanoViewer</h2>
      <div ref={containerRef} className="viewer viewer--small" data-own-markup />
      <p data-own-markup-status>
        status {snapshot.status}
        {snapshot.status === EnumViewerStatus.Ready ? ' ✓' : ''}
      </p>
    </section>
  );
};
