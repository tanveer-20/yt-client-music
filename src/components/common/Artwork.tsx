import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { artwork as artworkUrl } from '@/lib/artwork';

interface ArtworkProps {
  src?: string;
  alt: string;
  size?: number;
  className?: string;
  round?: boolean;
  eager?: boolean;
}

/** Square artwork with a graceful placeholder when the image is missing. */
export function Artwork({ src, alt, size = 544, className = '', eager }: ArtworkProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`artwork-fallback ${className}`} aria-hidden="true">
        <Music2 size={Math.max(16, Math.round(size / 8))} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={artworkUrl(src, size)}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
