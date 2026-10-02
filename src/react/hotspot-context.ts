import { type Context, createContext } from 'react';

import type { IPanoViewer } from '../viewer/viewer-types';

/**
 * Просмотрщик ближайшего `<PanoViewer>` для `<Hotspot>` внутри него; вне компонента — `null`.
 */
export const PanoViewerContext: Context<IPanoViewer | null> = createContext<IPanoViewer | null>(null);
