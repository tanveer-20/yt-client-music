import { useQuery } from '@tanstack/react-query';
import type { Track } from '@/types';
import { fetchLyrics } from '@/data/music/api';
import { isSynced, parseLrc, parsePlainLyrics } from './parse';

export function useLyrics(track: Track | null) {
  const query = useQuery({
    queryKey: ['lyrics', track?.id, track?.title, track?.artist],
    queryFn: async () => {
      if (!track) return null;
      const raw = await fetchLyrics(track);
      if (!raw) return null;
      if (raw.syncedLyrics) {
        const lines = parseLrc(raw.syncedLyrics);
        return {
          provider: raw.provider,
          synced: isSynced(lines),
          lines,
        };
      }
      if (raw.plainLyrics) {
        return {
          provider: raw.provider,
          synced: false,
          lines: parsePlainLyrics(raw.plainLyrics),
        };
      }
      return null;
    },
    enabled: Boolean(track),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  return {
    lyrics: query.data ?? null,
    loading: query.isLoading,
  };
}
