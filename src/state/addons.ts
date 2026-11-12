import { create } from 'zustand';
import * as api from '@/data/addons/api';
import type { Addon, AddonTrack } from '@/data/addons/api';

interface AddonsState {
  loaded: boolean;
  loading: boolean;
  error: string | null;
  addons: Addon[];
  query: string;
  searchLoading: boolean;
  searchError: string | null;
  results: AddonTrack[];

  load: (force?: boolean) => Promise<void>;
  add: (url: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggle: (id: string, enabled: boolean) => Promise<void>;
  move: (id: string, direction: -1 | 1) => Promise<void>;
  refresh: (id: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

function sortAddons(addons: Addon[]): Addon[] {
  return [...addons].sort((a, b) => a.order - b.order);
}

export const useAddonsStore = create<AddonsState>()((set, get) => ({
  loaded: false,
  loading: false,
  error: null,
  addons: [],
  query: '',
  searchLoading: false,
  searchError: null,
  results: [],

  async load(force = false) {
    if (get().loading || (get().loaded && !force)) return;
    set({ loading: true, error: null });
    try {
      const { addons } = await api.listAddons();
      set({ addons: sortAddons(addons), loaded: true });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not load addons.' });
    } finally {
      set({ loading: false });
    }
  },

  async add(url) {
    await api.addAddon(url);
    await get().load(true);
  },

  async remove(id) {
    await api.removeAddon(id);
    set((state) => ({ addons: sortAddons(state.addons.filter((addon) => addon.id !== id)) }));
  },

  async toggle(id, enabled) {
    await api.updateAddon(id, { enabled });
    set((state) => ({
      addons: sortAddons(
        state.addons.map((addon) => (addon.id === id ? { ...addon, enabled } : addon))
      ),
    }));
  },

  async move(id, direction) {
    const current = get().addons.find((addon) => addon.id === id);
    if (!current) return;
    const order = Math.max(0, current.order + direction);
    const updated = await api.updateAddon(id, { order });
    set((state) => ({ addons: sortAddons(state.addons.map((a) => (a.id === id ? updated : a))) }));
  },

  async refresh(id) {
    const refreshed = await api.refreshAddon(id);
    set((state) => ({
      addons: sortAddons(state.addons.map((addon) => (addon.id === id ? refreshed : addon))),
    }));
  },

  async search(query) {
    set({ query, searchLoading: true, searchError: null });
    try {
      const { tracks } = await api.searchAddons(query);
      set({ results: tracks, query });
    } catch (error) {
      set({
        searchError: error instanceof Error ? error.message : 'Addon search failed.',
        results: [],
      });
    } finally {
      set({ searchLoading: false });
    }
  },

  clearSearch() {
    set({ query: '', results: [], searchError: null });
  },
}));
