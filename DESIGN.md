---
name: Rem
description: High-fidelity adaptive music player interface with iOS-inspired frosted glass and OLED dark modes.
colors:
  primary: "#ef4444"
  primary-hover: "#f87171"
  primary-active: "#dc2626"
  oled-bg: "#000000"
  midnight-bg: "#0b0f19"
  light-bg: "#f8fafc"
  surface-glass: "rgba(14, 14, 16, 0.78)"
  surface-card: "rgba(255, 255, 255, 0.05)"
  surface-card-hover: "rgba(255, 255, 255, 0.08)"
  border-subtle: "rgba(255, 255, 255, 0.08)"
  text-primary-dark: "#ffffff"
  text-secondary-dark: "rgba(255, 255, 255, 0.55)"
  text-muted-dark: "rgba(255, 255, 255, 0.35)"
  slate-dark: "#0f172a"
  slate-muted: "#475569"
  slate-light: "#94a3b8"
  slate-border: "#e2e8f0"
  brand-deep: "#b91c1c"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  heading:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  subheading:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  subcaption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  hairline: "1.5px"
  xs: "2px"
  sm: "8px"
  md: "12px"
  pill-sm: "0.875rem"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.text-primary-dark}"
    rounded: "{rounded.lg}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  track-row:
    rounded: "{rounded.lg}"
    padding: "12px 16px"
---

## Overview
YT Music Client adheres to a refined, distraction-free aesthetic blending iOS audio surface conventions with modern tactile desktop music players. Visual styling emphasizes high-contrast album artwork, fluid frosted glass backdrops, exponential acceleration curves, and pure black OLED battery optimization.

## Colors
- **Brand Red Accent (`#ef4444`, `#dc2626`)**: Reserved for active playback indicators, like buttons, scrubber progress tracks, and primary call-to-actions.
- **OLED Surface (`#000000`)**: True zero-emission black background for OLED screens with subtle white overlays (`rgba(255,255,255, 0.05)`).
- **Midnight Navy Slate (`#0b0f19`)**: Deep slate blue-black for ambient desktop listening.
- **iOS Light Surface (`#f8fafc`)**: Crisp, light gray surface with high contrast slate text (`#0f172a`).

## Typography
- **Font Stack**: System native hierarchy (`SF Pro Display`, `Inter`, `system-ui`).
- **Tabular Numerals**: Time scrubbers, track indexes, and duration clocks enforce `tabular-nums` to prevent horizontal jitter during playback.
- **Hierarchy Floor**: Page titles use `-0.025em` tracking for tight impact. Captions and secondary artist text maintain a minimum contrast ratio of 4.5:1.

## Layout
- **Desktop (md+)**: Left fixed sidebar (`w-60`), fluid content canvas, and persistent bottom playback control strip (`PlayerBar`).
- **Mobile (<md)**: Sticky header with safe-area padding (`env(safe-area-inset-top)`), vertical scrollable list, bottom mini-player with hairline progress bar, and floating bottom tab bar (`env(safe-area-inset-bottom)`).
- **Overlays**: Top-level root stacking context hosts `NowPlayingView` full-screen sheet and `TrackDetailsModal`.

## Elevation & Depth
- **Frosted Glass (`backdrop-filter: blur(24px) saturate(180%)`)**: Used on `PlayerBar`, `TabBar`, and `Sidebar`.
- **Card Shadows**: Soft, diffuse ambient drops (`0 4px 20px -2px var(--theme-shadow)`), strictly avoiding hard offset box-shadows.

## Shapes
- **Container Radii**: Cards and track thumbnails use `12px` to `16px` border radii.
- **Controls & Chips**: Ghost action buttons and badges use `full` pill shapes (`9999px`).

## Components
- **ProgressBar / Scrubber**: Dual mouse/touch-friendly slider with `touch-action: none`, `touchcancel` recovery, and full keyboard seeking support (Left/Right, Home/End).
- **TrackCard**: Accessible interactive row (`role="button"`, `tabIndex={0}`) featuring album thumbnail, artist metadata, duration, and overflow action menu.
- **NowPlayingView**: Immersive artwork backdrop with real-time audio spectrum equalizer and exponential spring transitions.

## Do's and Don'ts
- **DO**: Use exponential easing curves (`cubic-bezier(0.16, 1, 0.3, 1)`) for UI entries and pops.
- **DO**: Maintain min 44×44px touch targets on all interactive icon buttons.
- **DO**: Respect `prefers-reduced-motion` by preserving state change without aggressive spin or bounce effects.
- **DON'T**: Use bouncy or elastic easing (`cubic-bezier(0.34, 1.56, 0.64, 1)` or `animate-bounce`).
- **DON'T**: Use gradient text or unmotivated decorative glass panels.
- **DON'T**: Rely on raw non-semantic `div` containers for clickable items without proper ARIA and keyboard handles.
