import { describe, expect, it } from 'vitest';
import { cleanArtist, cleanTitle, dominantIsDark, formatCount, formatLongTime, formatTime } from './format';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats hours', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(7325)).toBe('2:02:05');
  });

  it('guards invalid and negative values', () => {
    expect(formatTime(undefined)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(-4)).toBe('0:00');
  });
});

describe('formatLongTime', () => {
  it('rounds to the nearest minute', () => {
    expect(formatLongTime(0)).toBe('0 min');
    expect(formatLongTime(59)).toBe('1 min');
    expect(formatLongTime(3599)).toBe('1 hr 0 min');
    expect(formatLongTime(5400)).toBe('1 hr 30 min');
    expect(formatLongTime(Number.NaN)).toBe('0 min');
  });
});

describe('formatCount', () => {
  it('abbreviates large counts', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_500)).toBe('1.5K');
    expect(formatCount(12_000)).toBe('12K');
    expect(formatCount(2_400_000)).toBe('2.4M');
    expect(formatCount(undefined)).toBe('');
  });
});

describe('metadata cleanup', () => {
  it('removes common video suffixes', () => {
    expect(cleanTitle('One More Time (Official Music Video)')).toBe('One More Time');
    expect(cleanTitle('Around the World [Audio]')).toBe('Around the World');
    expect(cleanTitle('Get Lucky (Official Video) - Daft Punk', 'Daft Punk')).toBe('Get Lucky');
  });

  it('removes Topic and VEVO suffixes from artist names', () => {
    expect(cleanArtist('Daft Punk - Topic')).toBe('Daft Punk');
    expect(cleanArtist('Daft PunkVEVO')).toBe('Daft Punk');
  });
});

describe('dominantIsDark', () => {
  it('classifies colours by luminance', () => {
    expect(dominantIsDark('#000000')).toBe(true);
    expect(dominantIsDark('#f5f5f7')).toBe(false);
    expect(dominantIsDark('not-a-colour')).toBe(true);
  });
});
