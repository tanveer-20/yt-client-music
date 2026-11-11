import { usePlayerStore } from '@/state/player';
import { useArtworkTint } from '@/lib/tint';

/** Soft artwork-coloured gradient blobs behind the app. */
export function MeshBackdrop() {
  const thumbnail = usePlayerStore((s) => s.currentTrack?.thumbnail);
  const tint = useArtworkTint(thumbnail);

  return (
    <div
      className="mesh"
      aria-hidden="true"
      style={
        tint.color
          ? {
              ['--mesh-a' as string]: `color-mix(in srgb, ${tint.color} 34%, transparent)`,
              ['--mesh-b' as string]: `color-mix(in srgb, ${tint.color} 16%, transparent)`,
            }
          : undefined
      }
    />
  );
}
