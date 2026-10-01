import { type ReactElement, useEffect, useState } from 'react';

import { describeMissingLocalAssets, findMissingLocalAssets } from './local-assets';

/**
 * Проверка локальных файлов — синхронизация с внешней системой (dev-сервером), поэтому эффект
 * законен; флаг отмены не даёт записать ответ в размонтированный компонент.
 */
export const App = (): ReactElement => {
  const [missingUrls, setMissingUrls] = useState<string[]>([]);

  useEffect(() => {
    let isCancelled = false;

    void findMissingLocalAssets().then((urls) => {
      if (!isCancelled) {
        setMissingUrls(urls);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <main>
      <nav>
        <a href="/">Vanilla playground</a>
      </nav>
      <h1>PanoViewer</h1>
      {missingUrls.length > 0 && <p className="hint">{describeMissingLocalAssets(missingUrls)}</p>}
    </main>
  );
};
