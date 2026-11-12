export interface AudioAnalysis {
  bpm?: number;
  /** Relative RMS energy 0..1, useful for smooth/energy mix style. */
  energy: number;
  beats?: number[];
}

export type TransitionCurve = 'equalPower' | 'linear';

export interface AutomixTransitionPlan {
  type: 'crossfade' | 'cut';
  durationSec: number;
  curve: TransitionCurve;
}
