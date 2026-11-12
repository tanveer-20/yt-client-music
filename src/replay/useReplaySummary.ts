import { useCallback, useEffect, useState } from 'react';
import { clearReplay, exportBackup, getReplaySummary, getRecentPlays, importBackup } from './recorder';
import type { PlayRecord, ReplayBackup, ReplayRange, ReplaySummary } from './types';

export function useReplaySummary(initial: ReplayRange = 'week') {
  const [range, setRange] = useState<ReplayRange>(initial);
  const [summary, setSummary] = useState<ReplaySummary | null>(null);
  const [recent, setRecent] = useState<PlayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextRange: ReplayRange = range) => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, plays] = await Promise.all([getReplaySummary(nextRange), getRecentPlays(50)]);
      setSummary(nextSummary);
      setRecent(plays);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load Replay.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const downloadBackup = useCallback(async () => {
    const backup = (await exportBackup()) as ReplayBackup;
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `rem-replay-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const readBackup = useCallback(async (file: File) => {
    const payload = JSON.parse(await file.text()) as unknown;
    const result = await importBackup(payload);
    await load();
    return result;
  }, [load]);

  const reset = useCallback(async () => {
    await clearReplay();
    await load();
  }, [load]);

  return { range, setRange, summary, recent, loading, error, reload: load, downloadBackup, readBackup, reset };
}
