export function formatTime(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatLongTime(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) / 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

export function formatCount(n: number | undefined): string {
  if (!n || !Number.isFinite(n)) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export function cleanTitle(title: string, artist?: string): string {
  let value = title
    .replace(/\s*\(Official\s+(Music\s+)?Video\)/gi, '')
    .replace(/\s*\[Official\s+(Music\s+)?Video\]/gi, '')
    .replace(/\s*\(Lyric(s)?\s+Video\)/gi, '')
    .replace(/\s*\(Audio\)/gi, '')
    .replace(/\s*\[Audio\]/gi, '')
    .trim();

  if (artist) {
    const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value.replace(new RegExp(`\\s*[-–—]\\s*${escaped}$`, 'i'), '').trim();
  }
  return value || title;
}

export function cleanArtist(artist: string): string {
  return artist.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
}

export function dominantIsDark(hex: string): boolean {
  const m = hex.replace('#', '');
  if (m.length !== 6) return true;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.55;
}
