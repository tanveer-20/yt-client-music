import { useEffect, useState } from 'react';
import { artwork } from './artwork';

interface TintResult {
  color: string | null;
  isDark: boolean;
}

/** Extract a dominant colour from artwork for page tinting. */
export function useArtworkTint(url: string | undefined): TintResult {
  const [result, setResult] = useState<TintResult>({ color: null, isDark: true });

  useEffect(() => {
    if (!url) {
      setResult({ color: null, isDark: true });
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 24, 24);
        const { data } = ctx.getImageData(0, 0, 24, 24);

        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 200) continue;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          total++;
        }
        if (!total) return;

        r = Math.round(r / total);
        g = Math.round(g / total);
        b = Math.round(b / total);

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;

        if (saturation < 0.08) {
          r = g = b = Math.round((r + g + b) / 3);
        }

        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        setResult({ color: hex, isDark: luminance < 0.5 });
      } catch {
        setResult({ color: null, isDark: true });
      }
    };

    img.onerror = () => {
      if (!cancelled) setResult({ color: null, isDark: true });
    };

    img.src = artwork(url, 64);
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result;
}
