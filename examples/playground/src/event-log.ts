const MAX_EVENTS = 40;

/**
 * Журнал событий песочницы: последние события сверху, текст — через `textContent`.
 */
export const createEventLog =
  (list: HTMLOListElement): ((message: string) => void) =>
  (message) => {
    const item = document.createElement('li');

    item.textContent = `${new Date().toLocaleTimeString()} ${message}`;
    list.prepend(item);

    while (list.children.length > MAX_EVENTS) {
      list.lastElementChild?.remove();
    }
  };
