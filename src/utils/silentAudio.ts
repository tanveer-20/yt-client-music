/**
 * silentAudio — Top-level silent media session anchor.
 *
 * Why this exists:
 * Chrome/Firefox attach the Android media notification to the media session of the
 * browsing context that owns *playing* media. In the web build our audio lives inside
 * the cross-origin YouTube iframe, so the top-level page has no playing media of its
 * own and the notification never appears (or appears un-owned by us). Per the Media
 * Session spec, top-level `navigator.mediaSession` metadata only colors the
 * notification of the frame that owns the media resource — it cannot restyle a
 * cross-origin iframe's session.
 *
 * What this does:
 * Creates a top-level, same-origin, looping SILENT <audio> element (generated WAV
 * Blob — no assets, no network). While it plays, the top-level document owns a real
 * media session, so the metadata/handlers we already set in `mediaSession.ts` /
 * `useAudioPlayer.ts` drive the notification: clean title, artist, album, artwork,
 * and forwarded play/pause/seek controls.
 *
 * Firefox support: non-audible media requests audio focus (Mozilla bug 1290467,
 * fixed in Firefox 51 — "request audio focus for any media instead of audible one").
 * Chrome shows media notifications only for media >= 5s, hence a 12s loop.
 */

let audioEl: HTMLAudioElement | null = null;
let blobUrl: string | null = null;

const SILENCE_SECONDS = 12; // Chrome needs >= 5s media duration to show a notification
const SILENCE_SAMPLE_RATE = 8000; // 8000Hz * 8-bit mono * 12s ≈ 96KB — cheap to generate

/**
 * Builds a PCM WAV Blob URL containing pure digital silence.
 * 8-bit unsigned silence byte = 128.
 */
function buildSilentWavBlobUrl(): string {
  const frameCount = SILENCE_SAMPLE_RATE * SILENCE_SECONDS;
  const buffer = new ArrayBuffer(44 + frameCount);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + frameCount, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SILENCE_SAMPLE_RATE, true);
  view.setUint32(28, SILENCE_SAMPLE_RATE * 1, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, frameCount, true);
  for (let i = 0; i < frameCount; i++) view.setUint8(44 + i, 128);

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function getElement(): HTMLAudioElement {
  if (!audioEl) {
    if (!blobUrl) blobUrl = buildSilentWavBlobUrl();
    audioEl = new Audio(blobUrl);
    audioEl.loop = true;
    audioEl.volume = 1; // element-level "audible" flag; the *content* is silence
    audioEl.muted = false; // muted=false is required — Firefox ignores muted elements
    audioEl.preload = 'auto';
    audioEl.setAttribute('aria-hidden', 'true');
    audioEl.setAttribute('data-silent-session', 'true');
    audioEl.style.display = 'none';
  }
  return audioEl;
}

/**
 * Primes the element INSIDE a user gesture (first pointerdown anywhere on the page).
 * A successful play() grants the element its autoplay permission for the rest of the
 * session even when later play() calls happen in async contexts (gesture already lost).
 */
export function primeSilentAudio(): void {
  try {
    const a = getElement();
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
      }).catch(() => {
        // Autoplay blocked / not unlocked yet — harmless; next real gesture retries.
      });
    }
  } catch {}
}

/**
 * Starts (or resumes) the silent anchor. Called when the top-level session should be
 * ACTIVE — i.e. whenever the YouTube iframe engine is supposed to be audible.
 * Idempotent: no-op if already playing.
 */
export function startSilentAudio(): void {
  try {
    const a = getElement();
    if (!a.paused) return;
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // One delayed retry in case the gesture raced the async resolveStream chain.
        setTimeout(() => {
          try {
            a.play().catch(() => {});
          } catch {}
        }, 80);
      });
    }
  } catch {}
}

/** Pauses the anchor while playback is user-paused (metadata/playbackState keep the session). */
export function pauseSilentAudio(): void {
  try {
    if (audioEl && !audioEl.paused) audioEl.pause();
  } catch {}
}

/** Fully stops + rewinds the anchor when there is no track / session to represent. */
export function stopSilentAudio(): void {
  try {
    if (audioEl) {
      audioEl.pause();
      try {
        audioEl.currentTime = 0;
      } catch {}
    }
  } catch {}
}

export function isSilentAudioPlaying(): boolean {
  return !!audioEl && !audioEl.paused;
}
