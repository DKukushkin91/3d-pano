/**
 * Статус просмотрщика: `loading` — ещё ничего не показано, `preview` — видно превью, основное изображение
 * грузится, `ready` — основное изображение на экране, `error` — см. `snapshot.error`.
 */
export const EnumViewerStatus = {
  Loading: 'loading',
  Preview: 'preview',
  Ready: 'ready',
  Error: 'error',
} as const;

export type TViewerStatus = (typeof EnumViewerStatus)[keyof typeof EnumViewerStatus];

/**
 * Категория ошибки говорит хосту, что делать: `webgl` — показать заглушку, `tour` — это ошибка данных тура,
 * `resource` — можно предложить «Повторить» (`viewer.retry()`), `image` — ошибка подготовки ассетов.
 */
export const EnumErrorCategory = {
  Webgl: 'webgl',
  Tour: 'tour',
  Resource: 'resource',
  Image: 'image',
} as const;

export type TErrorCategory = (typeof EnumErrorCategory)[keyof typeof EnumErrorCategory];

/**
 * Подробный код ошибки — для логов и диагностики; действие хоста выбирается по категории.
 */
export const EnumErrorCode = {
  WebglUnavailable: 'webgl-unavailable',
  InvalidTour: 'invalid-tour',
  NetworkFailed: 'network-failed',
  HttpStatus: 'http-status',
  DecodeFailed: 'decode-failed',
  LoaderFailed: 'loader-failed',
  InvalidImage: 'invalid-image',
} as const;

export type TErrorCode = (typeof EnumErrorCode)[keyof typeof EnumErrorCode];

/**
 * Каждый код принадлежит ровно одной категории; ошибка собирается по коду, поэтому рассогласовать их нельзя.
 */
export const ERROR_CATEGORY_BY_CODE: Readonly<Record<TErrorCode, TErrorCategory>> = {
  [EnumErrorCode.WebglUnavailable]: EnumErrorCategory.Webgl,
  [EnumErrorCode.InvalidTour]: EnumErrorCategory.Tour,
  [EnumErrorCode.NetworkFailed]: EnumErrorCategory.Resource,
  [EnumErrorCode.HttpStatus]: EnumErrorCategory.Resource,
  [EnumErrorCode.DecodeFailed]: EnumErrorCategory.Resource,
  [EnumErrorCode.LoaderFailed]: EnumErrorCategory.Resource,
  [EnumErrorCode.InvalidImage]: EnumErrorCategory.Image,
};
