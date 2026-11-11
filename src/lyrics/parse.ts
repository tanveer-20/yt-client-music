import type { LyricLine, LyricWord } from '@/types';

const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;

function toMs(minutes: string, seconds: string, fraction?: string): number {
  let ms = Number(minutes) * 60_000 + Number(seconds) * 1000;
  if (fraction) {
    ms += fraction.length === 3 ? Number(fraction) : fraction.length === 2 ? Number(fraction) * 10 : 0;
  }
  return ms;
}

/** Parse standard and enhanced LRC into timed lines (ms). */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let offset = 0;

  for (const raw of lrc.split(/\r?\n/)) {
    const offsetMatch = raw.match(/^\[offset:([+-]?\d+)\]$/i);
    if (offsetMatch) {
      offset = Number(offsetMatch[1]);
      continue;
    }

    const tags = [...raw.matchAll(TIME_TAG)];
    if (!tags.length) continue;

    let text = raw.replace(TIME_TAG, '').trim();
    if (!text) continue;

    const words: LyricWord[] = [];
    if (text.includes('<')) {
      const wordTags = [...text.matchAll(WORD_TAG)];
      if (wordTags.length) {
        const segments: Array<{ time: number; text: string }> = [];
        let cursor = 0;
        for (const match of wordTags) {
          const before = text.slice(cursor, match.index);
          if (before.trim()) segments.push({ time: -1, text: before });
          segments.push({
            time: toMs(match[1], match[2], match[3]),
            text: text.slice(match.index + match[0].length, (match.index ?? 0) + match[0].length + 40),
          });
          cursor = (match.index ?? 0) + match[0].length;
        }
        // Rebuild words from sequential tag positions.
        words.length = 0;
        const positions = [...text.matchAll(WORD_TAG)].map((m) => ({
          index: m.index ?? 0,
          time: toMs(m[1], m[2], m[3]),
          length: m[0].length,
        }));
        for (let i = 0; i < positions.length; i++) {
          const start = positions[i].index + positions[i].length;
          const end = i + 1 < positions.length ? positions[i + 1].index : text.length;
          const word = text.slice(start, end);
          if (!word) continue;
          words.push({
            time: positions[i].time,
            duration: i + 1 < positions.length ? positions[i + 1].time - positions[i].time : 0,
            text: word,
          });
        }
        text = words.map((w) => w.text).join('');
      }
    }

    for (const tag of tags) {
      lines.push({
        time: toMs(tag[1], tag[2], tag[3]) + offset,
        duration: 0,
        text,
        words: words.length ? words.map((w) => ({ ...w, time: w.time + offset })) : undefined,
      });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    if (next) lines[i].duration = Math.max(0, next.time - lines[i].time);
    else lines[i].duration = 6000;
  }
  return lines;
}

export function parsePlainLyrics(text: string): LyricLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ time: 0, duration: 0, text: line }));
}

export function isSynced(lines: LyricLine[]): boolean {
  return lines.length > 1 && lines.some((l) => l.time > 0);
}
