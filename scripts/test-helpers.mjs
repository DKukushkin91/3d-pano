import assert from 'node:assert/strict';

import { EnumErrorCode, PanoLoadError, createPanoError } from '../dist/internal.js';

export const IMAGE_URL = 'https://cdn.example.com/room.jpg';
export const FACE_URL = 'https://cdn.example.com/tiles/kitchen/{face}.jpg';

export const rejectionOf = (promise) =>
  promise.then(
    () => assert.fail('expected the promise to reject'),
    (error) => error,
  );

export const networkError = (url = IMAGE_URL) =>
  new PanoLoadError(createPanoError(EnumErrorCode.NetworkFailed, { message: 'offline', url }));

export const httpError = (httpStatus, url = IMAGE_URL) =>
  new PanoLoadError(createPanoError(EnumErrorCode.HttpStatus, { message: 'http', url, httpStatus }));

export const fakeImage = (width, height = width) => ({
  width,
  height,
  isClosed: false,
  close() {
    this.isClosed = true;
  },
});
