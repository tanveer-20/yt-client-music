import { useRef } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { usePlayerStore } from '@/state/player';

interface VolumeControlProps {
  compact?: boolean;
}

export function VolumeControl({ compact }: VolumeControlProps) {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const wrapRef = useRef<HTMLDivElement>(null);

  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={wrapRef}
      className="row gap-1"
      onWheel={(event) => {
        event.preventDefault();
        setVolume(volume + (event.deltaY < 0 ? 0.05 : -0.05));
      }}
    >
      <button
        type="button"
        className="player-btn"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        <Icon size={17} />
      </button>
      {!compact && (
        <input
          type="range"
          className="slider"
          min={0}
          max={1}
          step={0.01}
          value={effective}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="Volume"
          style={{ width: 74, ['--fill' as string]: `${effective * 100}%` }}
        />
      )}
    </div>
  );
}
