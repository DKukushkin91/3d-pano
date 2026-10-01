# Viewer API

The core entry `@dkukushkin/3d-pano` creates and controls viewers. It has no runtime dependencies and works with plain DOM elements.

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
