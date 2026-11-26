import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './ui';

beforeEach(() => {
  useUIStore.setState({ fullScreenOpen: false, panel: null });
});

describe('side panels', () => {
  it('keeps the full-screen player open when a panel opens', () => {
    useUIStore.getState().openFullScreen();
    useUIStore.getState().togglePanel('lyrics');

    expect(useUIStore.getState().fullScreenOpen).toBe(true);
    expect(useUIStore.getState().panel).toBe('lyrics');
  });

  it('closes the panel without closing the player', () => {
    useUIStore.getState().openFullScreen();
    useUIStore.getState().setPanel('queue');
    useUIStore.getState().closePanel();

    expect(useUIStore.getState().fullScreenOpen).toBe(true);
    expect(useUIStore.getState().panel).toBeNull();
  });

  it('closes any panel when the full-screen player opens', () => {
    useUIStore.getState().setPanel('lyrics');
    useUIStore.getState().openFullScreen();

    expect(useUIStore.getState().panel).toBeNull();
    expect(useUIStore.getState().fullScreenOpen).toBe(true);
  });
});
