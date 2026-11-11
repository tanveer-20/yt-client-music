import { useState } from 'react';
import { Activity } from 'lucide-react';
import { usePlayerStore } from '@/state/player';
import { useSettingsStore } from '@/state/settings';
import { getApiBase } from '@/config';
import { formatTime } from '@/lib/format';

/** Diagnostics panel for playback/streaming nerds. */
export function NerdStats() {
  const current = usePlayerStore((s) => s.currentTrack);
  const state = usePlayerStore((s) => s.state);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const settings = useSettingsStore();
  const [audioInfo, setAudioInfo] = useState<string>('—');

  const inspect = () => {
    const el = document.getElementById('rem-deck-a') as HTMLAudioElement | null;
    const idle = document.getElementById('rem-deck-b') as HTMLAudioElement | null;
    if (!el) {
      setAudioInfo('No deck');
      return;
    }
    const buffered = el.buffered.length
      ? `${formatTime(el.buffered.start(0))}–${formatTime(el.buffered.end(el.buffered.length - 1))}`
      : 'none';
    const target = !el.paused || el.readyState > 0 ? el : idle;
    const source = target?.currentSrc || el.currentSrc || '';
    setAudioInfo(
      `readyState ${el.readyState}/4 · network ${el.networkState}/3 · buffered ${buffered} · src ${
        source ? source.split('/').slice(-1)[0] : '—'
      }`
    );
  };

  return (
    <section className="rounded-xl border border-[var(--labelDivider)] p-5">
      <div className="row gap-2 mb-3">
        <Activity size={17} className="text-[var(--keyColor)]" />
        <h2 className="t-title-3" style={{ fontWeight: 700 }}>
          Nerd stats
        </h2>
      </div>

      <div className="kv">
        <span>Engine</span>
        <span>Proxy deck (dual audio)</span>
      </div>
      <div className="kv">
        <span>Server</span>
        <span className="truncate">{getApiBase()}</span>
      </div>
      <div className="kv">
        <span>State</span>
        <span>{state}</span>
      </div>
      <div className="kv">
        <span>Track</span>
        <span className="truncate">{current?.title || '—'}</span>
      </div>
      <div className="kv">
        <span>Position</span>
        <span>
          {formatTime(progress)} / {formatTime(duration)}
        </span>
      </div>
      <div className="kv">
        <span>Crossfade</span>
        <span>{settings.crossfadeSec}s</span>
      </div>
      <div className="kv">
        <span>Quality</span>
        <span>{settings.quality}</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" className="secondary-btn self-start" onClick={inspect}>
          Inspect audio deck
        </button>
        <code className="t-footnote t-secondary break-all">{audioInfo}</code>
      </div>
    </section>
  );
}
