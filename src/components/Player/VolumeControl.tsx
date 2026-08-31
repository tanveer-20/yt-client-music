/**
 * VolumeControl — mute toggle + horizontal volume slider.
 */

import {
  RiVolumeUpLine,
  RiVolumeDownLine,
  RiVolumeMuteLine,
} from 'react-icons/ri';
import { usePlayerStore } from '../../stores/playerStore';
import { ProgressBar } from './ProgressBar';

export function VolumeControl() {
  const { volume, isMuted, setVolume, toggleMute } = usePlayerStore();

  const effectiveVolume = isMuted ? 0 : volume;

  const VolumeIcon =
    effectiveVolume === 0
      ? RiVolumeMuteLine
      : effectiveVolume < 0.5
        ? RiVolumeDownLine
        : RiVolumeUpLine;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMute}
        className="btn-ghost"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        <VolumeIcon size={20} />
      </button>
      <div className="w-24 hidden md:block">
        <ProgressBar
          value={effectiveVolume}
          onChange={setVolume}
          height={3}
          activeColor="bg-white"
        />
      </div>
    </div>
  );
}
