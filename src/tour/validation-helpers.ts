/**
 * Сборщик проблем: валидаторы не бросают исключений, а сообщают путь и описание, чтобы автор тура
 * увидел все ошибки за один проход.
 */
export type TReport = (path: string, message: string) => void;

export const MUST_BE_OBJECT = 'must be an object';
export const MUST_BE_NON_EMPTY_STRING = 'must be a non-empty string';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isDictionaryValue = (dictionary: Readonly<Record<string, string>>, value: unknown): boolean =>
  Object.values(dictionary).some((entry) => entry === value);

export const isNumberPair = (value: unknown): value is readonly [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber);

interface IRangeBounds {
  lowest: number;
  highest: number;
  isStrict: boolean;
}

const isOrderedPair = (pair: readonly [number, number], isStrict: boolean): boolean =>
  isStrict ? pair[0] < pair[1] : pair[0] <= pair[1];

const isPairInside = (pair: readonly [number, number], bounds: IRangeBounds): boolean =>
  pair[0] >= bounds.lowest && pair[1] <= bounds.highest;

/**
 * Диапазон `[min, max]` внутри допустимых границ; `isStrict` требует `min < max`, иначе допускается
 * равенство (например, фиксированный FOV).
 */
export const isRangeWithin = (value: unknown, bounds: IRangeBounds): value is readonly [number, number] =>
  isNumberPair(value) && isPairInside(value, bounds) && isOrderedPair(value, bounds.isStrict);

export const listOf = (dictionary: Readonly<Record<string, string>>): string =>
  Object.values(dictionary).join(', ');

export const childPath = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

export const itemPath = (path: string, index: number): string => `${path}[${String(index)}]`;

export interface INumberRule {
  isValid: (numberValue: number) => boolean;
  requirement: string;
}

export const validateOptionalNumber = (
  value: unknown,
  path: string,
  report: TReport,
  rule: INumberRule,
): void => {
  if (value !== undefined && (!isFiniteNumber(value) || !rule.isValid(value))) {
    report(path, rule.requirement);
  }
};
