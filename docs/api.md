# Viewer API

The core entry `@dkukushkin/3d-pano` creates and controls viewers. It has no runtime dependencies, works with plain DOM elements and is safe to import on the server: nothing touches the DOM until a viewer is created.

## Creating a viewer

```ts
import { createPanoViewer } from '@dkukushkin/3d-pano';

const viewer = createPanoViewer(container, {
  tour, // see docs/tour.md
  label: 'Apartment tour',
});
```

The container must be an element with a size (for example `position: absolute; inset: 0` inside a sized parent, or an explicit height). The viewer appends its own root element with a canvas and an overlay; the container's own attributes and styles are never changed, and `destroy()` removes everything it added. Any number of viewers can live on one page.

| Option                | Default                         | Meaning                                                                                                                                              |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tour`                | —                               | The tour to show. Its start scene is shown first; switch scenes with `showScene` and replace the tour with `setTour`.                                |
| `label`               | —                               | Accessible name of the viewer, required. Read out by screen readers.                                                                                 |
| `loader`              | `fetch`                         | Your own image loading, see [Loading images](#loading-images).                                                                                       |
| `retry`               | `{ attempts: 2, delayMs: 500 }` | Retries of failed images, see [retry](#retry).                                                                                                       |
| `controls`            | everything on                   | `drag`, `wheel`, `pinch`, `keyboard`, `inertia` (booleans), `wheelSpeed`, `keyboardSpeed`, `inertiaFriction` (multipliers, default 1), `invertDrag`. |
| `maxPixelRatio`       | `2`                             | Upper limit of the device pixel ratio used for rendering — saves battery on 3× screens.                                                              |
| `renderScale`         | `1`                             | Extra multiplier of the drawing buffer size, for example `0.75` on weak devices.                                                                     |
| `sceneCacheMegabytes` | `256`                           | Video memory budget for prepared scenes, see [Preloading and the scene cache](#preloading-and-the-scene-cache).                                      |
| `tileCacheMegabytes`  | `128`                           | Video memory budget for the tiles of [multiresolution cubes](#multiresolution-tiles), shared by all scenes. `0` shows only the smallest level.       |
| `tileFadeMs`          | `200`                           | How long a tile loaded after the scene appeared fades in over the coarser level. `0` shows it at once.                                               |
| `renderHotspot`       | —                               | Your own element for the hotspots of the tour instead of the default button, see [Hotspots](#hotspots).                                              |

Invalid options are programmer errors and throw synchronously: a non-element container or an empty `label` throws `TypeError`, invalid numbers throw `RangeError`. Messages start with `3d-pano:` and name the option. Problems with the tour data or the images never throw — they arrive as [errors](#errors).

## Methods

All methods are plain functions without `this`, so they can be passed around as callbacks.

| Method                     | Meaning                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getView()`                | The current view `{ yaw, pitch, roll, fov, fovMode }` in degrees.                                                                                                                                                                                                                          |
| `setView(view)`            | Changes any fields of the view; the scene limits apply. A non-finite angle or an unknown `fovMode` throws `RangeError`.                                                                                                                                                                    |
| `project(point)`           | Screen position of a target (`TViewTarget`) — a sphere point `{ yaw, pitch }` or a direction `{ x, y, z }`: `{ x, y, isInView }` in CSS pixels from the top-left corner of the container, or `null` when the point is behind the camera.                                                   |
| `unproject(x, y)`          | The sphere point `{ yaw, pitch }` shown at a pixel of the container.                                                                                                                                                                                                                       |
| `lookAt(target, options?)` | Turns the camera smoothly to a sphere point or a direction, see [Camera animation](#camera-animation).                                                                                                                                                                                     |
| `addHotspot(options)`      | Places your own element over a point of the panorama or the world, see [Hotspots](#hotspots).                                                                                                                                                                                              |
| `showScene(id, options?)`  | Switches to a scene of the tour, see [Scenes and transitions](#scenes-and-transitions).                                                                                                                                                                                                    |
| `preloadScene(id)`         | Prepares a scene in video memory without showing it, see [Preloading](#preloading-and-the-scene-cache).                                                                                                                                                                                    |
| `setTour(tour, options?)`  | Replaces the tour without recreating the viewer, see [Replacing the tour](#replacing-the-tour).                                                                                                                                                                                            |
| `retry()`                  | Requests again the images of the current scene that failed (including a scene switch that failed) and finishes the switch; resolves when the scene is ready. Does nothing unless the error category is `resource`.                                                                         |
| `update(options)`          | Changes `label`, `loader`, `retry`, `controls`, `maxPixelRatio`, `renderScale`, `sceneCacheMegabytes`, `tileCacheMegabytes`, `tileFadeMs` and `renderHotspot` without recreating the viewer. A key set to `undefined` returns the default; `controls` and `retry` are replaced as a whole. |
| `on(name, handler)`        | Subscribes to an [event](#events); returns the unsubscribe function.                                                                                                                                                                                                                       |
| `getSnapshot()`            | The current [state snapshot](#state-snapshot).                                                                                                                                                                                                                                             |
| `subscribe(listener)`      | Calls `listener` after every snapshot change; returns the unsubscribe function.                                                                                                                                                                                                            |
| `destroy()`                | Removes the viewer, its listeners and GPU resources and cancels loading. Calling any method afterwards is harmless and does nothing.                                                                                                                                                       |
| `overlay`                  | An element above the panorama for your own interface. Pointer events on its children never rotate the camera.                                                                                                                                                                              |

`project` is what you need to place your own markers over the panorama:

```ts
const pin = viewer.project({ yaw: 30, pitch: -10 });

if (pin !== null && pin.isInView) {
  marker.style.transform = `translate(${pin.x}px, ${pin.y}px)`;
}
```

## Scenes and transitions

`showScene(id, options?)` switches to another scene of the tour and returns a promise:

```ts
import { EnumEasing } from '@dkukushkin/3d-pano';

const isShown = await viewer.showScene('kitchen-v2', {
  transition: { type: 'blend', durationMs: 300, easing: EnumEasing.SineInOut },
  view: 'keep',
  keepMotion: true,
});
```

While the new scene loads, the current one stays on screen and under the user's control; the switch happens when the full image of the new scene is ready. Its preview is not loaded — there is nothing to show it on. The promise resolves `true` when the switch is complete, including the transition.

| Option       | Default           | Meaning                                                                                                                                                                                                   |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transition` | `{ type: 'cut' }` | `{ type: 'cut' }` replaces the scene in one frame. `{ type: 'blend', durationMs?, easing? }` dissolves the old scene into the new one, by default in 500 ms with `sine-in-out`; `durationMs: 0` is a cut. |
| `view`       | `'scene'`         | `'scene'` — the start view of the new scene from the tour. `'keep'` — the current view, within the limits of the new scene. A view object — its fields over the start view of the new scene.              |
| `keepMotion` | `false`           | `true` keeps the inertia of the camera and a running [`lookAt`](#camera-animation) across the switch. Dragging and held keys always continue — they are the user's input.                                 |

The view and limits of the new scene apply the moment it appears. During a blend both scenes are drawn every frame and the controls stay on: with `view: 'keep'` both move with the camera, so switching between two renovations of the same room is seamless; otherwise the old scene stays still while the camera turns the new one.

`easing` takes a name from `EnumEasing` — `linear` and the `sine`, `quad`, `cubic`, `quart`, `quint`, `expo`, `circ`, `back`, `elastic` and `bounce` families with `-in`, `-out` and `-in-out` (for example `'cubic-out'`) — or your own function from progress `0…1` to `0…1`. The blend weight is clamped to `0…1`, so overshooting curves such as `back-out` never make a scene “brighter than full”.

**Races.** The last call wins. A call superseded by a newer `showScene` or `setTour` resolves `false`, and so does a pending switch when the viewer is destroyed. Calling `showScene` with the scene already on screen resolves `true` at once and cancels a switch that was still loading.

**Errors.** The promise rejects only when something went wrong; the rejection is an `Error` with the [error](#errors) in `details`:

```ts
try {
  await viewer.showScene('bedroom');
} catch (error) {
  if (error instanceof Error && 'details' in error) {
    console.warn('could not switch', error.details);
  }
}
```

An unknown id rejects with `unknown-scene` and changes nothing. A loading failure rejects, sets `status: 'error'` for the new scene and emits `error`, while the old scene stays on screen; `viewer.retry()` loads the missing images and finishes the switch. Invalid options are programmer errors and throw `RangeError` synchronously.

## Preloading and the scene cache

`preloadScene(id)` loads a scene and prepares it in video memory in the background; a later `showScene` of that scene starts without network requests. It resolves `true` when the scene is ready and kept in the cache, `false` when it was not kept (it did not fit the budget, the tour was replaced or the viewer destroyed):

```ts
for (const neighbour of ['bedroom', 'hall']) {
  void viewer.preloadScene(neighbour);
}
```

Preloads wait until the scene on screen (or the one being switched to) has loaded, then run one at a time in call order. A failed preload rejects its own promise only — the snapshot and the `error` event are not touched. A `showScene` of a scene that is being preloaded takes over the started download.

Prepared and recently shown scenes stay in a cache limited by `sceneCacheMegabytes` (default 256, an estimate of texture memory with mipmaps). Least recently used scenes are evicted first; the scene on screen and the one in a transition never are. With `0` only the scene on screen is kept and `preloadScene` resolves `false` without loading. As a guide, an 8K equirectangular image takes about 171 MB, six 2048 × 2048 cube faces about 128 MB. Lowering the budget with `update` evicts at once. A blend additionally uses two frame-sized textures for its duration.

## Multiresolution tiles

A [multiresolution cube](tour.md#multiresolution-cube) is drawn from tiles of several levels at once. Its smallest level is loaded whole and stays under everything; the level of every pixel is the smallest one whose pixels are no larger than the screen's, and while its tile is missing the next coarser loaded level is shown instead.

- **Appearing.** A multiresolution scene is ready — `showScene` switches, `sceneReady` arrives, `status` becomes `ready` and `loadProgress` reaches 1 — once the preview, the smallest level and the tiles of the needed level for the view it appears with are loaded. That view is the start view of the scene, the current view with `view: 'keep'`, or your view object, taken when you call `showScene`. Before that, a scene without a scene on screen shows its smallest level with `status: 'preview'`.
- **Looking around.** After that, tiles in view load in the background from the centre outwards, coarser levels first, up to eight requests at a time. Tiles that leave the view before they arrive are cancelled. `status` and `loadProgress` no longer change.
- **Memory.** Tiles of all scenes share one pool of `tileCacheMegabytes` (a 512 × 512 tile takes 1 MB). Tiles that were not drawn for longest are evicted first, never those of the current frame. Tiles that do not fit are not loaded, and that part of the view stays one level coarser. The smallest level and the preview count against `sceneCacheMegabytes` instead.
- **Errors.** A failed image needed for the scene to appear is a scene error, as for any other source, and `retry()` loads what is missing. A tile that fails later only leaves its part of the view coarser: no `error` event, and the tile is requested again when it comes back into view.
- **Zoom.** `limits.maxPixelZoom` counts from the most detailed level, so the user can zoom in before its tiles arrive.

## Replacing the tour

`setTour(tour, options?)` replaces the tour without recreating the viewer. It shows `options.scene`, otherwise the new `startScene`, otherwise the first scene; the other options and the promise work as in `showScene`:

```ts
await viewer.setTour(tour, { scene: 'kitchen', view: 'keep' });
```

Scenes whose sources are the same in the new tour stay in the cache. If the scene on screen keeps its id and sources, nothing reloads and the view stays — only the new limits apply. An invalid tour rejects with `invalid-tour` (and `issues`) and leaves the old tour working; preloads of scenes missing from the new tour resolve `false`.

## Camera animation

`lookAt(target, options?)` turns the camera smoothly to a target and returns a promise:

```ts
import type { ILookAtOptions, TViewTarget } from '@dkukushkin/3d-pano';

const pin: TViewTarget = { x: 1.2, y: -0.4, z: 2 };
const options: ILookAtOptions = { fov: 60, durationMs: 900, easing: 'cubic-out' };

const isReached = await viewer.lookAt(pin, options);
```

The target is the same as for `project`: a sphere point `{ yaw, pitch }` or a direction `{ x, y, z }` from the centre of the panorama, so a world point relative to the centre works as is. A direction straight up or down keeps the current `yaw`.

| Option       | Default       | Meaning                                                                                        |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------- |
| `fov`        | current       | Field of view at the end, in degrees of the current FOV mode: zoom in or out in the same move. |
| `durationMs` | `900`         | Duration of the turn, counted from the first frame after the call; `0` sets the view at once.  |
| `easing`     | `'cubic-out'` | A name from `EnumEasing` or your own function, as for [transitions](#scenes-and-transitions).  |
| `signal`     | —             | An `AbortSignal` that cancels this turn.                                                       |

Only `yaw`, `pitch` and `fov` change; `roll` and `fovMode` stay. The target goes through the scene limits first, so the camera arrives smoothly at the closest allowed view and the promise still resolves `true`; every frame stays within the limits, even with overshooting curves such as `back-out`. `yaw` takes the shorter way round; with a `bounds.yaw` range the camera stays inside it even when that way is longer. A target exactly behind the camera follows its current rotation (inertia or an interrupted turn) and is reached by turning right when the camera is still. When the camera already looks at the target, the promise resolves `true` at once.

**What stops a turn.** The promise resolves `false` and the camera stays where it got to when:

- the user presses on the panorama, scrolls the wheel, pinches or presses a control key — input disabled in `controls` and clicks on your interface in the overlay do not count;
- you call `setView` or another `lookAt`;
- the `signal` aborts;
- the viewer is destroyed.

If the user is already dragging or holding a key when you call `lookAt`, it resolves `false` at once and leaves the camera alone. Inertia after a release is not input: `lookAt` stops it and turns the camera. The promise never rejects; invalid arguments are programmer errors and throw `RangeError` synchronously.

**Scene switches.** While a new scene loads, the turn goes on. When the scene appears, the turn stops with `false`, unless `showScene` was called with `keepMotion: true`: then it continues to the same target within the limits of the new scene and ends on time. To turn to a point in another scene, wait for the switch first:

```ts
await viewer.showScene('bedroom');
await viewer.lookAt({ yaw: 120, pitch: -15 });
```

## Hotspots

Hotspots are elements over the panorama that the viewer keeps at their points while the camera moves — without re-rendering your framework. There are two kinds:

- **Hotspots of the tour** are data in `scene.hotspots` (see [Hotspots in the tour format](tour.md#hotspots)). The viewer draws them, navigates to their `target` and reports events.
- **Your own hotspots** are elements you add with `addHotspot`, for example product cards.

```ts
import { EnumHotspotAnchor } from '@dkukushkin/3d-pano';

const card = document.createElement('a');
card.href = '/products/chair';
card.textContent = 'Chair — 12 900 ₽';

const pin = viewer.addHotspot({
  element: card,
  position: { x: 1.5, y: -0.4, z: 2 },
  scene: 'kitchen-v2',
  anchor: EnumHotspotAnchor.BottomLeft,
});

pin.setPosition({ x: 1.4, y: -0.4, z: 2.1 });
pin.remove();
```

`addHotspot({ element, position, scene?, anchor?, plane? })` returns `{ setPosition, setScene, setAnchor, setPlane, remove }`; a setter called with `undefined` returns the field to its default. A hotspot with `scene` is shown only while that scene is on screen, without it — in every scene. After `remove()` or `destroy()` the methods do nothing. Invalid arguments throw synchronously: an `element` that is not an `HTMLElement` throws `TypeError`, other fields `RangeError` naming the field; a `scene` that is not in the tour is not an error.

**The element of a tour hotspot** is a `<button type="button">` with the hotspot's `title` (set as text, never as markup; without a title the button gets an `aria-label` from the target scene). The library adds no styles of its own — style it with CSS. To draw your own element instead, pass `renderHotspot`:

```ts
import { createPanoViewer } from '@dkukushkin/3d-pano';

const tourViewer = createPanoViewer(container, {
  tour,
  label: 'Apartment tour',
  renderHotspot: (hotspot, { signal }) => {
    const spot = document.createElement('button');

    spot.type = 'button';
    spot.className = 'floor-spot';
    spot.setAttribute('aria-label', hotspot.title ?? hotspot.id);
    window.addEventListener('resize', () => spot.blur(), { signal });

    return spot;
  },
});
```

`renderHotspot(hotspot, { sceneId, signal })` is called when the hotspot appears; `signal` aborts when its element is removed, so you can release whatever you attached. Clicks, hovering, focus, navigation and events work the same for your element and the default button. `update({ renderHotspot })` re-renders the visible hotspots.

**Placement.** `position` is a sphere point `{ yaw, pitch }` or a world point `{ x, y, z }` relative to the centre of the panorama. `anchor` chooses which point of the element lies there: `center` by default, or `top`, `bottom`, `left`, `right` and the four corners. Without `plane` the element keeps its size in pixels. With `plane: { width, facing?, spin? }` it lies in a plane of the world in perspective (CSS `matrix3d`) and grows when the camera zooms in — a mark on the floor, a sign on a wall; see [the tour format](tour.md#hotspots) for the fields.

**Visibility.** Hotspots of a scene are shown while that scene is on screen: while the next scene loads they stay and work, and when it appears (the start of a blend) they leave and the new ones come. A hotspot behind the camera is invisible and cannot be pressed, but stays in the Tab order. Nearer hotspots lie above farther ones. The elements you pass are never restyled: the viewer moves its own containers around them.

**Navigation.** Clicking a tour hotspot with `target` sends `hotspotClick` and then calls `showScene(target.scene, …target options)`; call `preventDefault()` in the handler to navigate your own way, for example through your router. Hovering or focusing such a hotspot preloads its scene, so the switch usually starts without network requests. A failed switch is reported by the `error` event, as when you call `showScene` yourself.

```ts
viewer.on('hotspotClick', ({ hotspot, preventDefault }) => {
  if (hotspot.target?.scene === 'paid-room') {
    preventDefault();
    openPaywall();
  }
});
```

**Keyboard.** Hotspots are reachable with Tab. When the keyboard focus lands on a hotspot outside the frame or behind the camera, the camera turns to it with [`lookAt`](#camera-animation); focus by mouse or touch never turns the camera.

**CSS hooks.** Each hotspot sits in a container with `data-pano-hotspot` (the hotspot id for tour hotspots, empty for yours) and `data-pano-visible="true"` or `"false"`; the default button has `data-pano-hotspot-button`. For example, to fade hotspots in:

```css
[data-pano-hotspot] [data-pano-hotspot-button] {
  transition: opacity 0.2s;
}

[data-pano-visible='false'] [data-pano-hotspot-button] {
  opacity: 0;
}
```

## Controls

| Input    | Behaviour                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag     | Mouse, pen or one finger: the image follows the pointer. Horizontal movement changes `yaw`, vertical movement changes `pitch`, also when looking straight up or down.           |
| Inertia  | A quick flick keeps rotating and slows down by itself; pressing again stops it at once.                                                                                         |
| Wheel    | Zooms in (forward) and out (back) over the panorama; the page does not scroll while the wheel is enabled.                                                                       |
| Pinch    | Two fingers zoom proportionally to the change of the distance between them.                                                                                                     |
| Keyboard | While the viewer is focused: arrows turn, `+` and `−` zoom. A short tap nudges the view, holding a key turns smoothly. Shortcuts with Ctrl, Cmd or Alt are left to the browser. |

Each input can be turned off with `controls` — at creation or on the fly with `update({ controls })`:

```ts
viewer.update({ controls: { wheel: false } });
```

With `drag` and `pinch` off, touch gestures over the viewer scroll and zoom the page as usual (`touch-action` follows the enabled inputs). `wheelSpeed`, `keyboardSpeed` and `inertiaFriction` multiply the defaults; `invertDrag` reverses dragging but not the keyboard. Elements you put into `viewer.overlay` keep their own clicks, wheel and keys — pressing them never starts a drag.

## Events

```ts
const unsubscribe = viewer.on('sceneReady', ({ sceneId }) => {
  console.info('ready', sceneId);
});
```

| Event            | Payload                                | When                                                                                                                           |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sceneChange`    | `{ sceneId, previousSceneId }`         | `snapshot.sceneId` changed: a switch was accepted, or the start scene (`previousSceneId: null`).                               |
| `sceneLoadStart` | `{ sceneId }`                          | A scene starts loading — on every accepted switch, also for a scene from the cache.                                            |
| `sceneReady`     | `{ sceneId }`                          | The full image of the scene is ready; for a cached scene right after `sceneLoadStart`.                                         |
| `viewChange`     | `{ view }`                             | The view changed; at most once per animation frame.                                                                            |
| `error`          | `{ error }`                            | See [Errors](#errors).                                                                                                         |
| `hotspotClick`   | `{ sceneId, hotspot, preventDefault }` | A hotspot of the tour was clicked (or pressed with Enter or Space). `preventDefault()` cancels the navigation to its `target`. |
| `hotspotEnter`   | `{ sceneId, hotspot }`                 | The pointer entered a hotspot of the tour or it got focus — once for both.                                                     |
| `hotspotLeave`   | `{ sceneId, hotspot }`                 | Neither the pointer nor the focus is on the hotspot any more, or it disappeared with its scene.                                |

Events of the start scene are delivered from the next microtask, so handlers attached right after `createPanoViewer` receive all of them, including tour and WebGL errors. An exception thrown by a handler does not stop the viewer or other handlers — it is reported with `reportError`, like any uncaught error.

## State snapshot

`getSnapshot()` returns an immutable object that changes only when the state does — pass `subscribe` and `getSnapshot` straight to `useSyncExternalStore` or any store adapter. The camera view is not part of the snapshot, so rotating the panorama does not re-render your interface; use the `viewChange` event for that.

| Field             | Meaning                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `sceneId`         | Id of the scene of the last accepted switch, `null` before the first one. It changes at once, while the previous scene may still be on screen. |
| `status`          | State of that scene: `loading` (not shown yet), `preview` (its preview is shown, the full image is loading), `ready` or `error`.               |
| `loadProgress`    | 0…1, the share of loaded images of that scene — enough for a loading bar, also during a switch.                                                |
| `isInteracting`   | `true` while the user is dragging or holding control keys.                                                                                     |
| `isTransitioning` | `true` from an accepted switch until the new scene is fully on screen (end of a blend); `false` for the start scene and after a failed switch. |
| `error`           | The last error or `null`.                                                                                                                      |

Status values have constants: `EnumViewerStatus.Loading`, `EnumViewerStatus.Preview`, `EnumViewerStatus.Ready`, `EnumViewerStatus.Error`. Comparing with the constant or with the string is the same.

## Accessibility

The viewer root is focusable (`tabindex="0"`), has `role="application"` and the accessible name from `label`. Keyboard controls work only while it is focused. Hotspots of the tour are real buttons with accessible names, reachable with Tab; focusing one outside the frame turns the camera to it.

## Loading images

### Default loading

Images are requested with `fetch` in CORS mode without credentials for other origins — the same as `<img crossorigin="anonymous">` — and decoded with `createImageBitmap`, off the main thread where the browser supports it. The image server must send `Access-Control-Allow-Origin` for cross-origin URLs.

### `loader`

Pass a `loader` to take over the requests: add authorisation headers, go through a proxy, sign URLs or serve images from your own cache. It receives the URL and an `AbortSignal` and resolves to a `Blob` or an `ImageBitmap`:

```ts
import { createPanoViewer } from '@dkukushkin/3d-pano';

const viewer = createPanoViewer(container, {
  tour,
  label: 'Apartment tour',
  loader: async ({ url, signal }) => {
    const response = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.blob();
  },
});
```

The signal is aborted when the image is no longer needed, for example when the viewer is destroyed — pass it on to `fetch`.

### `retry`

A failed image is requested again before an error is reported. By default there are two retries, 500 ms and then 1500 ms later (each delay is three times the previous one):

```ts
import { createPanoViewer } from '@dkukushkin/3d-pano';

createPanoViewer(container, { tour, label: 'Apartment tour', retry: { attempts: 2, delayMs: 500 } });
```

`attempts: 0` turns retries off. Network failures, `5xx` responses and failures of a custom `loader` are retried; `4xx` responses, undecodable files, wrong cube faces and cancelled requests are not.

## Errors

Every error is an object `{ category, code, message, url?, httpStatus?, issues?, cause? }`. Pick what to show by the **category** and log the **code**:

| `category` | What to do                                             | `code`                                                                                |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `webgl`    | Show a fallback: the browser cannot render.            | `webgl-unavailable`                                                                   |
| `tour`     | Fix the tour data; `issues` lists every problem.       | `invalid-tour`, `unknown-scene`                                                       |
| `resource` | Offer “Try again” — call `viewer.retry()`.             | `network-failed`, `http-status` (with `httpStatus`), `decode-failed`, `loader-failed` |
| `image`    | Fix the assets: for example a cube face is not square. | `invalid-image`                                                                       |

`url` names the image that failed and `cause` holds the original error (from the network, the decoder or your `loader`). The values are available as constants: `EnumErrorCategory.Resource`, `EnumErrorCode.HttpStatus` and so on; plain strings work too.
