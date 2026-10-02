interface IRangeFormat {
  input: string;
  output: string;
  format: (value: number) => string;
}

const RANGE_FORMATS: readonly IRangeFormat[] = [
  { input: '[data-duration]', output: '[data-duration-value]', format: (value) => `${String(value)} мс` },
  { input: '[data-move-blur]', output: '[data-move-blur-value]', format: (value) => value.toFixed(1) },
  {
    input: '[data-look-duration]',
    output: '[data-look-duration-value]',
    format: (value) => `${String(value)} мс`,
  },
  { input: '[data-tile-fade]', output: '[data-tile-fade-value]', format: (value) => `${String(value)} мс` },
];

const MOVE_TYPE = 'move';

const markPressed = (select: HTMLSelectElement, buttons: readonly HTMLButtonElement[]): void => {
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button.dataset.value === select.value));
  }
};

/**
 * Переключатель-сегменты вместо скрытого `<select>`: значение по-прежнему живёт в select, поэтому код
 * панели читает `.value` как раньше. Нажатие пользователя шлёт `input` и `change`, программная смена —
 * только `change`, по которому сегменты перерисовываются.
 */
export const enhanceSegmented = (select: HTMLSelectElement): void => {
  const group = document.createElement('div');
  const buttons = [...select.options].map((option) => {
    const button = document.createElement('button');

    button.type = 'button';
    button.textContent = option.textContent;
    button.dataset.value = option.value;
    button.addEventListener('click', () => {
      select.value = option.value;
      select.dispatchEvent(new Event('input'));
      select.dispatchEvent(new Event('change'));
    });

    return button;
  });

  group.className = 'segmented';
  group.title = select.title;
  group.append(...buttons);
  select.after(group);
  select.addEventListener('change', () => markPressed(select, buttons));
  markPressed(select, buttons);
};

const bindRangeValue = (root: ParentNode, { input, output, format }: IRangeFormat): void => {
  const range = root.querySelector<HTMLInputElement>(input);
  const value = root.querySelector<HTMLOutputElement>(output);

  if (range === null || value === null) {
    return;
  }

  const show = (): void => {
    value.value = format(Number(range.value));
  };

  range.addEventListener('input', show);
  show();
};

const showMoveOnly = (root: ParentNode, type: HTMLSelectElement): void => {
  for (const field of root.querySelectorAll<HTMLElement>('[data-move-only]')) {
    field.hidden = type.value !== MOVE_TYPE;
  }
};

/**
 * Оживляет панель песочницы: сегменты вместо выпадающих списков вида перехода и формата сцены, значения
 * рядом с ползунками и поля шага, которые видны только у шага.
 */
export const enhancePlaygroundControls = (root: ParentNode): void => {
  const transitionType = root.querySelector<HTMLSelectElement>('[data-transition-type]');

  for (const select of root.querySelectorAll<HTMLSelectElement>(
    '[data-transition-type], [data-scene-format]',
  )) {
    enhanceSegmented(select);
  }

  for (const range of RANGE_FORMATS) {
    bindRangeValue(root, range);
  }

  if (transitionType !== null) {
    transitionType.addEventListener('change', () => showMoveOnly(root, transitionType));
    showMoveOnly(root, transitionType);
  }
};
