# Product Context: Rem

## Overview
A high-performance YouTube Music audio streaming client and web/mobile application built with React, Vite, Tailwind CSS, and Capacitor (for Android), backed by an Express audio proxy service leveraging `yt-dlp`.

## Platform
- **Target**: Adaptive (`web` desktop & mobile, plus Capacitor `android` APK wrapper)
- **Engine**: React 19 + Vite 6 + Tailwind CSS v3
- **Audio Pipeline**: Express proxy server (`localhost:3001`), streaming 256kbps AAC YouTube audio via `yt-dlp`

## Core Users & Jobs-to-be-Done
- **Primary Audience**: Music listeners looking for an ad-free, high-fidelity, distraction-free player with seamless desktop and mobile ergonomics.
- **Key Jobs**:
  1. Instant search and queueing of any music track or album.
  2. Uninterrupted background playback with playlist management and favorites.
  3. Tailored listening ergonomics (OLED true-black mode, Midnight Navy Dark mode, and clean iOS Light mode).
  4. Lossless/high-bitrate audio monitoring and responsive playback scrubbers.

## Capabilities & Workflows
- **Playback Control**: Continuous playback, queue manipulation, shuffle, repeat (all / one / off), volume scrubbing, and keyboard hotkeys.
- **Library Management**: Custom playlist creation, track reordering, and offline local cache persistence in browser/device storage.
- **Responsive Shell**:
  - Desktop: Persistent frosted glass sidebar navigation with expanded media player controls.
  - Mobile: Floating bottom player bar, gesture-friendly full-screen Now Playing drawer, and bottom navigation tab bar with safe-area insets.

## Key Constraints
- Pure client-side UI performance with minimal layout thrashing and zero jarring bouncy easing.
- Full keyboard and screen-reader accessibility for seek bars, track rows, and modal dialogs.
- Respect system preferences for reduced motion and safe-area insets on mobile devices.
