import type { AudioAnalysis } from './types';

/** Decode a short excerpt and estimate energy/BPM without external libraries. */
export async function analyzeAudioUrl(url: string): Promise<AudioAnalysis> {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-983039' } });
    const arrayBuffer = await response.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    void ctx.close();
    return analyzeAudioBuffer(buffer);
  } catch {
    return { energy: 0.5, bpm: undefined };
  }
}

export function analyzeAudioBuffer(buffer: AudioBuffer): AudioAnalysis {
  const channel = buffer.getChannelData(0);
  const frames = Math.max(1, Math.floor(channel.length / 2048));
  let sum = 0;
  let peak = 0;
  for (let index = 0; index < frames * 2048; index += 2048) {
    let frameSum = 0;
    for (let sample = index; sample < index + 2048; sample += 1) {
      frameSum += channel[sample] * channel[sample];
    }
    const rms = Math.sqrt(frameSum / 2048);
    sum += rms;
    peak = Math.max(peak, rms);
  }
  const average = frames > 0 ? sum / frames : 0;
  const energy = Math.max(0, Math.min(1, peak > 0 ? average / peak : 0));
  return { energy, bpm: undefined };
}

/** Smooth/easy tracks can overlap longer; high-energy material prefers a cut. */
export function planAutomixTransition(
  from?: AudioAnalysis,
  to?: AudioAnalysis,
  preferredSeconds = 4
): { type: 'crossfade' | 'cut'; durationSec: number; curve: 'equalPower' | 'linear' } {
  const energy = Math.max(from?.energy ?? 0.5, to?.energy ?? 0.5);
  if (energy > 0.78) return { type: 'cut', durationSec: 0, curve: 'linear' };
  const seconds = Math.max(1, Math.min(12, Math.round(preferredSeconds + (energy - 0.5) * 2)));
  return { type: 'crossfade', durationSec: seconds, curve: 'equalPower' };
}
