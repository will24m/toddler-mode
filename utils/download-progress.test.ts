import { describe, expect, it } from 'vitest';
import { downloadProgressPercent } from '@/utils/download-progress';

describe('downloadProgressPercent', () => {
  it('computes the percentage from loaded/total', () => {
    expect(downloadProgressPercent({ loaded: 512, total: 1024 })).toBe(50);
  });

  it('treats loaded as a 0..1 fraction when total is missing', () => {
    expect(downloadProgressPercent({ loaded: 0.25 })).toBe(25);
  });

  it('returns 0 for a missing event or zero progress', () => {
    expect(downloadProgressPercent(null)).toBe(0);
    expect(downloadProgressPercent({ loaded: 0, total: 0 })).toBe(0);
  });
});
