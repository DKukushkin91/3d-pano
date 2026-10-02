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

- **Props** are the [viewer options](api.md#creating-a-viewer) plus `className`, `children`, the [scene props](#the-current-scene) `scene` and `sceneOptions`, and the event handlers `onSceneLoadStart`, `onSceneReady`, `onSceneChange`, `onViewChange`, `onError`, `onHotspotClick`, `onHotspotEnter`, `onHotspotLeave`. `renderHotspot` returns React content, see [Hotspots](#hotspots).
- **Handlers** can be new functions on every render — the viewer is not recreated and the latest handler is called.
- **Per-frame data**: `onViewChange` fires on every animation frame while the camera moves. Putting the view into React state there re-renders your component tree on every frame; write it to a DOM node through a ref or keep it in a ref instead. The component itself re-renders only when its props change — not on camera movement and not on snapshot changes; use `usePanoSnapshot` in the children that need the snapshot.
- **`controls` and `retry`** can be written inline; they are compared by value. Memoise `loader` if it is not a stable function.
- **`tour`** is compared by content: a tour built inline on every render changes nothing, while a tour with different data is applied with [`setTour`](api.md#replacing-the-tour) — the viewer is not recreated. To start from scratch (for example to reset the view and the cache), give the component a new `key`.
- **`ref`** receives the viewer instance after mounting and `null` after unmounting. A state setter as `ref` (as above) re-renders your component when the viewer appears.
- **`children`** are rendered through a portal into the overlay above the panorama, after mounting. They are positioned by you (for example `position: absolute`), and pressing them never rotates the camera.
- **Server rendering**: the component renders one empty `<div>` with your `className` on the server and in the first client render, so hydration never mismatches. The entry starts with `'use client'`.

## The current scene

`scene` selects the scene to show and `sceneOptions` how to get there — the same options as [`showScene`](api.md#scenes-and-transitions). Whenever the value of `scene` changes, the component calls `showScene(scene, sceneOptions)` with the `sceneOptions` of the same render, so different switches can use different transitions:

```tsx
import { useState } from 'react';
import type { IShowSceneOptions, ITour } from '@dkukushkin/3d-pano';
import { PanoViewer } from '@dkukushkin/3d-pano/react';

const RENOVATION_SWITCH: IShowSceneOptions = {
  transition: { type: 'blend', durationMs: 300, easing: 'sine-in-out' },
  view: 'keep',
  keepMotion: true,
};
const ROOM_SWITCH: IShowSceneOptions = { transition: { type: 'blend', durationMs: 800 } };

export const Apartment = ({ tour }: { tour: ITour }) => {
  const [scene, setScene] = useState('kitchen');
  const [sceneOptions, setSceneOptions] = useState(ROOM_SWITCH);

  const handleRenovationClick = () => {
    setScene('kitchen-v2');
    setSceneOptions(RENOVATION_SWITCH);
  };

  const handleSceneChange = ({ sceneId }: { sceneId: string }) => {
    setScene(sceneId);
  };

  return (
    <>
      <button type="button" onClick={handleRenovationClick}>
        Renovation 2
      </button>
      <PanoViewer
        tour={tour}
        scene={scene}
        sceneOptions={sceneOptions}
        label="Apartment tour"
        className="h-96"
        onSceneChange={handleSceneChange}
      />
    </>
  );
};
```

- The prop is applied **when its value changes**, like a starting value that you can move later. A scene shown in another way — `ref.current.showScene()` now, a navigation hotspot later — is not reverted; `onSceneChange` tells you about it so you can update your state (as above).
- When the component mounts with `scene`, that scene is shown first instead of the tour's `startScene`, without loading the start scene.
- If `tour` and `scene` change in the same render, one `setTour` call applies both.
- `sceneOptions` alone is read only when `scene` or `tour` changes; changing it does not switch anything.
- There is no promise to catch in props: a `scene` missing from the tour (`unknown-scene`) or an invalid new `tour` (`invalid-tour`) is passed to `onError` (or to `reportError` when there is no `onError`); loading errors arrive through the `error` event as usual. A `scene` missing from the tour at mount time makes the tour invalid, so `onError` receives `invalid-tour`.

## Turning the camera

[`lookAt`](api.md#camera-animation) is a method of the viewer, so call it from an effect with the viewer from `ref` (or from `usePanoViewer`). Abort the turn in the cleanup: when the target changes or the component unmounts, the camera stops instead of finishing the old turn.

```tsx
import { useEffect } from 'react';
import type { TViewTarget } from '@dkukushkin/3d-pano';
import type { IPanoViewer } from '@dkukushkin/3d-pano/react';

export const useFocusPin = (viewer: IPanoViewer | null, pin: TViewTarget | null): void => {
  useEffect(() => {
    if (viewer === null || pin === null) {
      return undefined;
    }

    const controller = new AbortController();

    void viewer.lookAt(pin, { signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [viewer, pin]);
};
```

The effect runs again whenever `pin` is a new object, so keep pins in stable objects (a constant, state or `useMemo`). To focus a pin in another scene, wait for the switch: `await viewer.showScene(id)`, then `lookAt` — or pass `keepMotion: true` when only the renovation changes and the turn should go on.

## Hotspots

**Your own hotspots** are `<Hotspot>` elements inside `<PanoViewer>`: the children are rendered through a portal into an element that the viewer keeps at `position`, so rotating the panorama never re-renders them. The props are those of [`addHotspot`](api.md#hotspots) without `element` — `position`, `scene`, `anchor`, `plane` — plus `className` for a wrapper of the children. They are compared by value, so a point built inline changes nothing; unmounting removes the hotspot.

```tsx
import { useState } from 'react';
import type { ITour } from '@dkukushkin/3d-pano';
import { Hotspot, PanoViewer } from '@dkukushkin/3d-pano/react';

interface IProductPin {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
}

export const RoomWithPins = ({ tour, pins }: { tour: ITour; pins: IProductPin[] }) => {
  const [isPinsVisible, setIsPinsVisible] = useState(true);

  return (
    <PanoViewer tour={tour} label="Room" className="absolute inset-0">
      <button type="button" onClick={() => setIsPinsVisible((current) => !current)}>
        Products
      </button>
      {isPinsVisible &&
        pins.map((pin) => (
          <Hotspot key={pin.id} position={pin.position} scene="kitchen-v2" anchor="bottom-left">
            <a href={`/products/${pin.id}`}>{pin.name}</a>
          </Hotspot>
        ))}
    </PanoViewer>
  );
};
```

Outside `<PanoViewer>` — for example with `usePanoViewer` — pass the viewer explicitly: `<Hotspot viewer={viewer} position={…}>`.

**Hotspots of the tour** are buttons by default. `renderHotspot(hotspot, sceneId)` draws your own content instead; clicks, hovering, navigation to `target` and the hotspot events keep working. A new function on every render is fine: the hotspot elements are not recreated, their content re-renders with the latest function. Showing and hiding the hotspots of a scene re-renders `<PanoViewer>` once per scene switch, rotating never does.

```tsx
import type { ITour } from '@dkukushkin/3d-pano';
import { PanoViewer } from '@dkukushkin/3d-pano/react';

export const ApartmentWithSpots = ({ tour, onRoute }: { tour: ITour; onRoute: (scene: string) => void }) => (
  <PanoViewer
    tour={tour}
    label="Apartment"
    className="absolute inset-0"
    renderHotspot={(hotspot) => <span className="floor-spot">{hotspot.title}</span>}
    onHotspotClick={({ hotspot, preventDefault }) => {
      if (hotspot.target !== undefined) {
        preventDefault();
        onRoute(hotspot.target.scene);
      }
    }}
  />
);
```

With `usePanoViewer`, `renderHotspot` works the same, and the hook returns the portals as `hotspotPortals` — render them anywhere in your markup.

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
  const { containerRef, snapshot } = usePanoViewer({
    tour,
    label: 'Balcony',
    onSceneReady: ({ sceneId }) => {
      analytics.track('scene_ready', { sceneId });
    },
  });

  return (
    <figure>
      <div ref={containerRef} className="h-96" />
      <figcaption>{snapshot.status}</figcaption>
    </figure>
  );
};
```

`containerRef` is a callback ref, so conditional rendering and replacing the node are handled — replacing the node is the only thing that recreates the viewer. `viewer` is `null` until the container is mounted. The options take the same [scene props](#the-current-scene), `renderHotspot` and event handlers as `<PanoViewer>` — `onSceneLoadStart`, `onSceneReady`, `onSceneChange`, `onViewChange`, `onError`, `onHotspotClick`, `onHotspotEnter`, `onHotspotLeave` — subscribed right after the viewer is created, so no event of the start scene is missed. Subscribing yourself with `viewer.on()` in an effect runs later and can miss them. With `renderHotspot`, render the returned `hotspotPortals` in your markup.
