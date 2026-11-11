import { useEffect } from 'react';
import { useArtworkTint } from '@/lib/tint';

/**
 * Tint the page background from artwork, the way Apple Music does for
 * detail pages. Resets the root variables when the page unmounts.
 */
export function usePageTint(url: string | undefined): void {
  const tint = useArtworkTint(url);

  useEffect(() => {
    const root = document.documentElement;
    if (tint.color) {
      root.style.setProperty('--page-tint', tint.color);
      root.style.setProperty(
        '--mesh-a',
        `color-mix(in srgb, ${tint.color} 55%, transparent)`
      );
      root.style.setProperty(
        '--mesh-b',
        `color-mix(in srgb, ${tint.color} 28%, transparent)`
      );
      root.dataset.tint = tint.isDark ? 'dark' : 'light';
    }

    return () => {
      root.style.removeProperty('--page-tint');
      root.style.removeProperty('--mesh-a');
      root.style.removeProperty('--mesh-b');
      delete root.dataset.tint;
    };
  }, [tint.color, tint.isDark]);
}
