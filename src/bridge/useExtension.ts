import { useCallback, useEffect, useRef, useState } from 'react';
import { onExtensionReady, probeExtension } from '@/bridge';

export type ExtensionStatus = 'unknown' | 'checking' | 'present' | 'missing';

export interface UseExtensionResult {
  status: ExtensionStatus;
  version: string | null;
  lastCheckedAt: number | null;
  recheck: () => void;
}

interface ExtensionHookState {
  status: ExtensionStatus;
  version: string | null;
  lastCheckedAt: number | null;
}

/**
 * React binding for extension detection.
 *
 * Performs an authoritative ping on mount, listens for the content script's
 * ready event (useful when the user installs the extension while Rem is open)
 * and exposes a manual `recheck()` for the Extension page.
 */
export function useExtension(): UseExtensionResult {
  const [state, setState] = useState<ExtensionHookState>({
    status: 'unknown',
    version: null,
    lastCheckedAt: null,
  });
  const [checkNonce, setCheckNonce] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, status: 'checking' }));

    void probeExtension(true).then((probe) => {
      if (cancelled || !mountedRef.current) return;
      setState({
        status: probe.present ? 'present' : 'missing',
        version: probe.version,
        lastCheckedAt: probe.checkedAt,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [checkNonce]);

  // If the content script announces itself after mount, run one more probe.
  useEffect(
    () =>
      onExtensionReady(() => {
        setCheckNonce((nonce) => nonce + 1);
      }),
    []
  );

  const recheck = useCallback(() => {
    setCheckNonce((nonce) => nonce + 1);
  }, []);

  return {
    status: state.status,
    version: state.version,
    lastCheckedAt: state.lastCheckedAt,
    recheck,
  };
}
