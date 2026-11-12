import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AutomixStyle = 'smooth' | 'energy';

interface AutomixState {
  enabled: boolean;
  transitionSec: number;
  style: AutomixStyle;
  setEnabled: (enabled: boolean) => void;
  setTransitionSec: (seconds: number) => void;
  setStyle: (style: AutomixStyle) => void;
}

export const useAutomixStore = create<AutomixState>()(
  persist(
    (set) => ({
      enabled: false,
      transitionSec: 4,
      style: 'smooth',
      setEnabled: (enabled) => set({ enabled }),
      setTransitionSec: (transitionSec) =>
        set({ transitionSec: Math.max(1, Math.min(12, transitionSec)) }),
      setStyle: (style) => set({ style }),
    }),
    { name: 'rem-automix' }
  )
);
