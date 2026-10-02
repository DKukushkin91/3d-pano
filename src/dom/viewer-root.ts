/**
 * Элементы, которые просмотрщик создаёт внутри контейнера хоста: корень (фокус, доступное имя, жесты),
 * canvas и оверлей для интерфейса хоста поверх панорамы. Сам контейнер не меняется.
 */
export interface IViewerRoot {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLDivElement;
  setLabel: (label: string) => void;
  remove: () => void;
}

const FILL_PARENT = {
  position: 'absolute',
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
} as const;

/**
 * Стили задаются через CSSOM, а не через `<style>`: это работает под строгим CSP без `unsafe-inline`.
 * Корень — `role="application"`, чтобы скринридер отдавал стрелки управлению панорамой. `overflow: clip`, а
 * не `hidden`: фокус на хотспоте за краем кадра не прокручивает корень и не сдвигает canvas.
 */
export const createViewerRoot = (container: HTMLElement, label: string): IViewerRoot => {
  const { ownerDocument } = container;
  const root = ownerDocument.createElement('div');
  const canvas = ownerDocument.createElement('canvas');
  const overlay = ownerDocument.createElement('div');

  root.setAttribute('role', 'application');
  root.setAttribute('aria-label', label);
  root.tabIndex = 0;
  Object.assign(root.style, { position: 'relative', width: '100%', height: '100%', overflow: 'clip' });
  Object.assign(canvas.style, { ...FILL_PARENT, display: 'block', width: '100%', height: '100%' });
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, FILL_PARENT);
  root.append(canvas, overlay);
  container.append(root);

  return {
    root,
    canvas,
    overlay,
    setLabel: (nextLabel) => {
      root.setAttribute('aria-label', nextLabel);
    },
    remove: () => {
      root.remove();
    },
  };
};
