/**
 * useKeyboardShortcuts — global keyboard shortcuts for the player.
 * Only active when not focused on input/textarea elements.
 */

import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) {
        return;
      }

      const store = usePlayerStore.getState();

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (store.state === 'playing') store.pause();
          else if (store.state === 'paused') store.resume();
          break;

        case 'ArrowRight':
          e.preventDefault();
          store.seek(Math.min(store.progress + 5, store.duration));
          break;

        case 'ArrowLeft':
          e.preventDefault();
          store.seek(Math.max(store.progress - 5, 0));
          break;

        case 'ArrowUp':
          e.preventDefault();
          store.setVolume(Math.min(store.volume + 0.05, 1));
          break;

        case 'ArrowDown':
          e.preventDefault();
          store.setVolume(Math.max(store.volume - 0.05, 0));
          break;

        case 'm':
        case 'M':
          store.toggleMute();
          break;

        case 's':
        case 'S':
          store.toggleShuffle();
          break;

        case 'r':
        case 'R':
          store.cycleRepeat();
          break;

        case 'n':
        case 'N':
          store.next();
          break;

        case 'p':
        case 'P':
          store.previous();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
