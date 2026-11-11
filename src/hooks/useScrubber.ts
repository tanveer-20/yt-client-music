import { useCallback, useRef, useState } from 'react';

/**
 * Range-input helper: show a local draft while dragging, commit once on
 * release so continuous seeks do not thrash the playback engine.
 */
export function useScrubber(value: number, commit: (next: number) => void) {
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false);

  const change = useCallback((next: number) => {
    if (dragging.current) setDraft(next);
    else commit(next);
  }, [commit]);

  const start = useCallback(() => {
    dragging.current = true;
  }, []);

  const end = useCallback((next: number) => {
    dragging.current = false;
    setDraft(null);
    commit(next);
  }, [commit]);

  const cancel = useCallback(() => {
    dragging.current = false;
    setDraft(null);
  }, []);

  return {
    value: draft ?? value,
    change,
    start,
    end,
    cancel,
  };
}
