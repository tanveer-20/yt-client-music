import { useEffect } from 'react';
import { usePlayerStore } from '@/state/player';
import { useUIStore } from '@/state/ui';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Global player keyboard shortcuts (BitChord-style). */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const player = usePlayerStore.getState();
      const ui = useUIStore.getState();

      switch (event.key) {
        case ' ':
        case 'k':
          event.preventDefault();
          player.togglePlay();
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (event.shiftKey) player.next();
          else player.seek(Math.min(player.progress + 5, player.duration || Infinity));
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (event.shiftKey) player.previous();
          else player.seek(Math.max(0, player.progress - 5));
          break;
        case 'ArrowUp':
          event.preventDefault();
          player.setVolume(player.volume + 0.05);
          break;
        case 'ArrowDown':
          event.preventDefault();
          player.setVolume(player.volume - 0.05);
          break;
        case 'm':
          player.toggleMute();
          break;
        case 's':
          player.toggleShuffle();
          break;
        case 'r':
          player.cycleRepeat();
          break;
        case 'q':
          ui.togglePanel('queue');
          break;
        case 'l':
          ui.togglePanel('lyrics');
          break;
        case 'f':
          ui.toggleFullScreen();
          break;
        case 'Escape':
          if (ui.panel) ui.closePanel();
          else if (ui.fullScreenOpen) ui.closeFullScreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
