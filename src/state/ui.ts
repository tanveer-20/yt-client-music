import { create } from 'zustand';

export type SidePanel = 'queue' | 'lyrics' | null;

interface UIState {
  fullScreenOpen: boolean;
  panel: SidePanel;
  openFullScreen: () => void;
  closeFullScreen: () => void;
  toggleFullScreen: () => void;
  setPanel: (panel: SidePanel) => void;
  togglePanel: (panel: Exclude<SidePanel, null>) => void;
  closePanel: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  fullScreenOpen: false,
  panel: null,
  openFullScreen: () => set({ fullScreenOpen: true, panel: null }),
  closeFullScreen: () => set({ fullScreenOpen: false }),
  toggleFullScreen: () =>
    set((s) => ({ fullScreenOpen: !s.fullScreenOpen, panel: s.fullScreenOpen ? s.panel : null })),
  setPanel: (panel) => set({ panel }),
  togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
  closePanel: () => set({ panel: null }),
}));
