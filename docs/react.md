# React

The `@dkukushkin/3d-pano/react` entry wraps the core viewer in a component and hooks. It adds no panorama logic of its own: every prop maps to an option, a method or an event of the [core API](api.md). React 18 and 19 are supported; `react` and `react-dom` are optional peer dependencies needed only for this entry.

## `<PanoViewer>`

```tsx
import { useState } from 'react';
import type { ITour } from '@dkukushkin/3d-pano';
import { type IPanoViewer, PanoViewer } from '@dkukushkin/3d-pano/react';

export const ApartmentTour = ({ tour }: { tour: ITour }) => {
  const [viewer, setViewer] = useState<IPanoViewer | null>(null);

  const handleSceneReady = ({ sceneId }: { sceneId: string }) => {
    analytics.track('scene_ready', { sceneId });
  };

  return (
    <PanoViewer
      ref={setViewer}
      tour={tour}
      label="Apartment tour"
      className="absolute inset-0"
      controls={{ keyboard: true }}
      onSceneReady={handleSceneReady}
    >
      <LoadingBar viewer={viewer} />
    </PanoViewer>
  );
};
```

- **Props** are the [viewer options](api.md#creating-a-viewer) plus `className`, `children` and the event handlers `onSceneLoadStart`, `onSceneReady`, `onViewChange`, `onError`.
- **Handlers** can be new functions on every render — the viewer is not recreated and the latest handler is called.
- **`controls` and `retry`** can be written inline; they are compared by value. Memoise `loader` if it is not a stable function.
- **`tour`** is compared by reference: a new tour object recreates the viewer, so keep it in state, a constant or `useMemo`.
- **`ref`** receives the viewer instance after mounting and `null` after unmounting. A state setter as `ref` (as above) re-renders your component when the viewer appears.
- **`children`** are rendered through a portal into the overlay above the panorama, after mounting. They are positioned by you (for example `position: absolute`), and pressing them never rotates the camera.
- **Server rendering**: the component renders one empty `<div>` with your `className` on the server and in the first client render, so hydration never mismatches. The entry starts with `'use client'`.

## `usePanoSnapshot(viewer)`

Reads the [state snapshot](api.md#state-snapshot) and re-renders only when it changes — not while the panorama rotates. For `null` (before mounting, or on the server) it returns the initial snapshot with `status: 'loading'`.

```tsx
import { type IPanoViewer, usePanoSnapshot } from '@dkukushkin/3d-pano/react';

export const LoadingBar = ({ viewer }: { viewer: IPanoViewer | null }) => {
  const { loadProgress, status } = usePanoSnapshot(viewer);

  return status === 'ready' ? null : <progress value={loadProgress} />;
};
```

## `usePanoViewer(options)`

The same viewer for your own markup:

```tsx
import type { ITour } from '@dkukushkin/3d-pano';
import { usePanoViewer } from '@dkukushkin/3d-pano/react';

export const Balcony = ({ tour }: { tour: ITour }) => {
  const { containerRef, viewer, snapshot } = usePanoViewer({ tour, label: 'Balcony' });

  return (
    <figure>
      <div ref={containerRef} className="h-96" />
      <figcaption>{snapshot.status}</figcaption>
    </figure>
  );
};
```

`containerRef` is a callback ref, so conditional rendering and replacing the node are handled. `viewer` is `null` until the container is mounted. The state you need for rendering is in `snapshot`; events of the start scene are delivered before an effect of yours could subscribe, so prefer the snapshot or `<PanoViewer>` event props for them.
