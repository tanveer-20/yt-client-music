import { describe, expect, it } from 'vitest';
import { isSynced, parseLrc, parsePlainLyrics } from './parse';

describe('parseLrc', () => {
  it('parses timestamps and derives durations', () => {
    const lines = parseLrc('[00:01.50]First line\n[00:04.00]Second line\n[00:08.25]Third');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ time: 1500, text: 'First line', duration: 2500 });
    expect(lines[1]).toMatchObject({ time: 4000, text: 'Second line', duration: 4250 });
    expect(lines[2]).toMatchObject({ time: 8250, text: 'Third', duration: 6000 });
  });

  it('applies the LRC offset', () => {
    const lines = parseLrc('[offset:250]\n[00:01.00]Shifted');
    expect(lines[0].time).toBe(1250);
  });

  it('expands multiple timestamps for one lyric', () => {
    const lines = parseLrc('[00:01.00][00:10.00]Chorus');
    expect(lines.map((line) => line.time)).toEqual([1000, 10_000]);
  });

  it('parses enhanced word timings', () => {
    const [line] = parseLrc('[00:01.00]<00:01.00>Hello <00:01.50>world');
    expect(line.words?.map((word) => word.text)).toEqual(['Hello ', 'world']);
    expect(line.words?.[1].time).toBe(1500);
  });

  it('ignores metadata and blank lines', () => {
    expect(parseLrc('[ar:Artist]\n[ti:Title]\n\n')).toEqual([]);
  });
});

describe('plain lyrics', () => {
  it('returns one unsynced line per non-empty row', () => {
    const lines = parsePlainLyrics('One\n\nTwo\n  Three  ');
    expect(lines.map((line) => line.text)).toEqual(['One', 'Two', 'Three']);
    expect(isSynced(lines)).toBe(false);
  });
});
