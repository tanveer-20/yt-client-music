import { Capacitor } from '@capacitor/core';

export const isNative = (): boolean => Capacitor.isNativePlatform();

export const isMobileViewport = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

export const isTouch = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
