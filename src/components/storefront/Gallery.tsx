'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface GalleryItem {
  src: string;
  large: string;
  alt: string;
}

/** Accessible gallery: thumbnails are buttons; the lightbox is a modal dialog with keyboard support. */
export function Gallery({ items, layout, lightbox, labels }: { items: GalleryItem[]; layout: 'grid' | 'carousel'; lightbox: boolean; labels: { close: string; prev: string; next: string; open: string } }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setOpen(null);
    lastFocus.current?.focus();
  }, []);
  useEffect(() => {
    if (open === null) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      const rtl = document.documentElement.dir === 'rtl' || !!(e.target as HTMLElement)?.closest('[dir=rtl]');
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + (rtl ? -1 : 1) + items.length) % items.length));
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i + (rtl ? 1 : -1) + items.length) % items.length));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, items.length, close]);

  return (
    <>
      <div className={`sf-gallery ${layout === 'carousel' ? 'carousel' : ''}`}>
        {items.map((it, i) =>
          lightbox ? (
            <button
              key={i}
              type="button"
              aria-label={`${labels.open}: ${it.alt}`}
              onClick={(e) => {
                lastFocus.current = e.currentTarget;
                setOpen(i);
              }}
            >
              <div className="sf-media r-1-1">
                <img src={it.src} alt={it.alt} loading="lazy" width={640} height={640} />
              </div>
            </button>
          ) : (
            <div key={i} className="sf-media r-1-1">
              <img src={it.src} alt={it.alt} loading="lazy" width={640} height={640} />
            </div>
          ),
        )}
      </div>
      {open !== null && items[open] && (
        <div className="sf-lightbox" role="dialog" aria-modal="true" aria-label={items[open].alt} onClick={(e) => e.target === e.currentTarget && close()}>
          <img src={items[open].large} alt={items[open].alt} />
          <button ref={closeRef} type="button" className="close" aria-label={labels.close} onClick={close}>×</button>
          {items.length > 1 && (
            <>
              <button type="button" className="prev" aria-label={labels.prev} onClick={() => setOpen((open - 1 + items.length) % items.length)}>‹</button>
              <button type="button" className="next" aria-label={labels.next} onClick={() => setOpen((open + 1) % items.length)}>›</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
