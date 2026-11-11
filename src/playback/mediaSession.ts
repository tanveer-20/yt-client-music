import type { Track } from '@/types';

export function createMediaMetadata(track: Track): MediaMetadata {
  const art = track.thumbnail || '';
  return new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album || 'Rem',
    artwork: art
      ? [
          { src: art.replace(/=w\d+-h\d+.*$/, '=w96-h96-l90-rj'), sizes: '96x96', type: 'image/jpeg' },
          { src: art.replace(/=w\d+-h\d+.*$/, '=w192-h192-l90-rj'), sizes: '192x192', type: 'image/jpeg' },
          { src: art.replace(/=w\d+-h\d+.*$/, '=w512-h512-l90-rj'), sizes: '512x512', type: 'image/jpeg' },
        ]
      : [],
  });
}

export function bindMediaSession(): () => void {
  if (!('mediaSession' in navigator)) return () => {};

  const actions: MediaSessionAction[] = [
    'play',
    'pause',
    'previoustrack',
    'nexttrack',
    'seekto',
    'seekbackward',
    'seekforward',
  ];
  actions.forEach((action) => {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      /* unsupported */
    }
  });

  return () => {
    actions.forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        /* unsupported */
      }
    });
  };
}
