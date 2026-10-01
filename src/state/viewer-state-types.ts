import type { ITourIssue } from '../tour/tour-types';
import type { TErrorCategory, TErrorCode, TViewerStatus } from './viewer-dictionaries';

/**
 * Ошибка просмотрщика. `url` — у ошибок изображений, `httpStatus` — у кода `http-status`, `issues` — у
 * ошибок тура, `cause` — исходная ошибка (сети, декодера или загрузчика хоста).
 */
export interface IPanoError {
  category: TErrorCategory;
  code: TErrorCode;
  message: string;
  url?: string;
  httpStatus?: number;
  issues?: ITourIssue[];
  cause?: unknown;
}

/**
 * Снимок состояния для фреймворков. Вид камеры сюда не входит: он меняется каждый кадр и приходит
 * событием `viewChange`, а снимок меняется редко и не заставляет интерфейс перерисовываться при вращении.
 */
export interface IPanoViewerSnapshot {
  sceneId: string | null;
  status: TViewerStatus;
  loadProgress: number;
  isInteracting: boolean;
  error: IPanoError | null;
}
