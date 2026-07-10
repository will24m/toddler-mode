import { describe, expect, it } from 'vitest';
import { createDeltaExtractor } from '@/utils/stream-delta';

describe('createDeltaExtractor', () => {
  it('emits only the newly added suffix for growing full-text chunks', () => {
    const extract = createDeltaExtractor();
    expect(extract('Hel')).toBe('Hel');
    expect(extract('Hello')).toBe('lo');
    expect(extract('Hello world')).toBe(' world');
  });

  it('returns an empty delta when the chunk repeats', () => {
    const extract = createDeltaExtractor();
    extract('abc');
    expect(extract('abc')).toBe('');
  });

  it('treats a non-prefix chunk as a raw delta (already-incremental streams)', () => {
    const extract = createDeltaExtractor();
    expect(extract('Hello ')).toBe('Hello ');
    expect(extract('world')).toBe('world');
    expect(extract('Hello world!')).toBe('!');
  });

  it('stringifies non-string chunks', () => {
    const extract = createDeltaExtractor();
    expect(extract(123)).toBe('123');
  });
});
