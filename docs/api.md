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

| Option          | Default                         | Meaning                                                                                                                                              |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tour`          | —                               | The tour to show. The start scene is shown; scene switching comes in a later release.                                                                |
| `label`         | —                               | Accessible name of the viewer, required. Read out by screen readers.                                                                                 |
| `loader`        | `fetch`                         | Your own image loading, see [Loading images](#loading-images).                                                                                       |
| `retry`         | `{ attempts: 2, delayMs: 500 }` | Retries of failed images, see [retry](#retry).                                                                                                       |
| `controls`      | everything on                   | `drag`, `wheel`, `pinch`, `keyboard`, `inertia` (booleans), `wheelSpeed`, `keyboardSpeed`, `inertiaFriction` (multipliers, default 1), `invertDrag`. |
| `maxPixelRatio` | `2`                             | Upper limit of the device pixel ratio used for rendering — saves battery on 3× screens.                                                              |
| `renderScale`   | `1`                             | Extra multiplier of the drawing buffer size, for example `0.75` on weak devices.                                                                     |

Invalid options are programmer errors and throw synchronously: a non-element container or an empty `label` throws `TypeError`, invalid numbers throw `RangeError`. Messages start with `3d-pano:` and name the option. Problems with the tour data or the images never throw — they arrive as [errors](#errors).

## Methods

All methods are plain functions without `this`, so they can be passed around as callbacks.

| Method                | Meaning                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getView()`           | The current view `{ yaw, pitch, roll, fov, fovMode }` in degrees.                                                                                                                                              |
| `setView(view)`       | Changes any fields of the view; the scene limits apply. A non-finite angle or an unknown `fovMode` throws `RangeError`.                                                                                        |
| `project(point)`      | Screen position of a sphere point `{ yaw, pitch }` or a direction `{ x, y, z }`: `{ x, y, isInView }` in CSS pixels from the top-left corner of the container, or `null` when the point is behind the camera.  |
| `unproject(x, y)`     | The sphere point `{ yaw, pitch }` shown at a pixel of the container.                                                                                                                                           |
| `retry()`             | Requests again the images of the current scene that failed; resolves when the scene is ready. Does nothing unless the error category is `resource`.                                                            |
| `update(options)`     | Changes `label`, `loader`, `retry`, `controls`, `maxPixelRatio` and `renderScale` without recreating the viewer. A key set to `undefined` returns the default; `controls` and `retry` are replaced as a whole. |
| `on(name, handler)`   | Subscribes to an [event](#events); returns the unsubscribe function.                                                                                                                                           |
| `getSnapshot()`       | The current [state snapshot](#state-snapshot).                                                                                                                                                                 |
| `subscribe(listener)` | Calls `listener` after every snapshot change; returns the unsubscribe function.                                                                                                                                |
| `destroy()`           | Removes the viewer, its listeners and GPU resources and cancels loading. Calling any method afterwards is harmless and does nothing.                                                                           |
| `overlay`             | An element above the panorama for your own interface. Pointer events on its children never rotate the camera.                                                                                                  |

`project` is what you need to place your own markers over the panorama:

```ts
const pin = viewer.project({ yaw: 30, pitch: -10 });

if (pin !== null && pin.isInView) {
  marker.style.transform = `translate(${pin.x}px, ${pin.y}px)`;
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

| Event            | Payload       | When                                                |
| ---------------- | ------------- | --------------------------------------------------- |
| `sceneLoadStart` | `{ sceneId }` | A scene starts loading.                             |
| `sceneReady`     | `{ sceneId }` | The full image of the scene is on screen.           |
| `viewChange`     | `{ view }`    | The view changed; at most once per animation frame. |
| `error`          | `{ error }`   | See [Errors](#errors).                              |

Events of the start scene are delivered from the next microtask, so handlers attached right after `createPanoViewer` receive all of them, including tour and WebGL errors. An exception thrown by a handler does not stop the viewer or other handlers — it is reported with `reportError`, like any uncaught error.

## State snapshot

`getSnapshot()` returns an immutable object that changes only when the state does — pass `subscribe` and `getSnapshot` straight to `useSyncExternalStore` or any store adapter. The camera view is not part of the snapshot, so rotating the panorama does not re-render your interface; use the `viewChange` event for that.

| Field           | Meaning                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sceneId`       | Id of the current scene, `null` before the first one.                                                               |
| `status`        | `loading` (nothing on screen yet), `preview` (the preview is shown, the full image is loading), `ready` or `error`. |
| `loadProgress`  | 0…1, the share of loaded images of the scene, preview included — enough for a loading bar.                          |
| `isInteracting` | `true` while the user is dragging or holding control keys.                                                          |
| `error`         | The last error or `null`.                                                                                           |

Status values have constants: `EnumViewerStatus.Loading`, `EnumViewerStatus.Preview`, `EnumViewerStatus.Ready`, `EnumViewerStatus.Error`. Comparing with the constant or with the string is the same.

## Accessibility

The viewer root is focusable (`tabindex="0"`), has `role="application"` and the accessible name from `label`. Keyboard controls work only while it is focused.

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
createPanoViewer(container, { tour, label, retry: { attempts: 2, delayMs: 500 } });
```

`attempts: 0` turns retries off. Network failures, `5xx` responses and failures of a custom `loader` are retried; `4xx` responses, undecodable files, wrong cube faces and cancelled requests are not.

## Errors

Every error is an object `{ category, code, message, url?, httpStatus?, issues?, cause? }`. Pick what to show by the **category** and log the **code**:

| `category` | What to do                                             | `code`                                                                                |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `webgl`    | Show a fallback: the browser cannot render.            | `webgl-unavailable`                                                                   |
| `tour`     | Fix the tour data; `issues` lists every problem.       | `invalid-tour`                                                                        |
| `resource` | Offer “Try again” — call `viewer.retry()`.             | `network-failed`, `http-status` (with `httpStatus`), `decode-failed`, `loader-failed` |
| `image`    | Fix the assets: for example a cube face is not square. | `invalid-image`                                                                       |

`url` names the image that failed and `cause` holds the original error (from the network, the decoder or your `loader`). The values are available as constants: `EnumErrorCategory.Resource`, `EnumErrorCode.HttpStatus` and so on; plain strings work too.
