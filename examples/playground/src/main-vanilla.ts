import { describeMissingLocalAssets, findMissingLocalAssets } from './local-assets';

import './styles.css';

const required = <TElement extends Element>(element: TElement | null): TElement => {
  if (element === null) {
    throw new Error('playground: a required element is missing');
  }

  return element;
};

const localHint = required(document.querySelector<HTMLParagraphElement>('[data-local-hint]'));

const showLocalHint = async (): Promise<void> => {
  const missingUrls = await findMissingLocalAssets();

  if (missingUrls.length === 0) {
    return;
  }

  localHint.textContent = describeMissingLocalAssets(missingUrls);
  localHint.hidden = false;
};

void showLocalHint();
