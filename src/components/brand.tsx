import { useEffect, useState } from 'react';
import type { readBranding } from '../lib/branding';

export function Brand({ name, logo }: ReturnType<typeof readBranding>) {
  const [failed, setFailed] = useState(false);
  const image = failed ? null : logo;

  useEffect(() => {
    document.title = name ?? 'Eruza';
    const icon = document.querySelector('link[rel="icon"]');
    if (icon) {
      icon.setAttribute('href', image ?? '/favicon.svg');
      if (image) icon.removeAttribute('type');
      else icon.setAttribute('type', 'image/svg+xml');
    }
  }, [name, image]);

  return (
    <>
      {image ? (
        <img className="brand-logo" src={image} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="brand-mark" aria-hidden="true">
          e
        </span>
      )}
      <span className="brand-name">
        {name ?? (
          <>
            eruza<span className="brand-dot">.</span>
          </>
        )}
      </span>
    </>
  );
}
