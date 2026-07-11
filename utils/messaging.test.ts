import { describe, expect, it } from 'vitest';
import {
  MAX_SELECTION_LENGTH,
  MIN_SELECTION_LENGTH,
  parseSummarizeText,
} from '@/utils/messaging';

describe('parseSummarizeText', () => {
  it('returns the text for a well-formed request', () => {
    expect(parseSummarizeText({ type: 'summarize', text: 'explain this' })).toBe('explain this');
  });

  it('trims surrounding whitespace', () => {
    expect(parseSummarizeText({ type: 'summarize', text: '  hi there  ' })).toBe('hi there');
  });

  it('rejects wrong shapes and non-string text', () => {
    expect(parseSummarizeText(null)).toBeNull();
    expect(parseSummarizeText('summarize')).toBeNull();
    expect(parseSummarizeText({ type: 'other', text: 'hi there' })).toBeNull();
    expect(parseSummarizeText({ type: 'summarize' })).toBeNull();
    expect(parseSummarizeText({ type: 'summarize', text: 42 })).toBeNull();
  });

  it('rejects text below the minimum length', () => {
    expect(parseSummarizeText({ type: 'summarize', text: 'ab' })).toBeNull();
    expect(parseSummarizeText({ type: 'summarize', text: '  a  ' })).toBeNull();
    expect(parseSummarizeText({ type: 'summarize', text: 'a'.repeat(MIN_SELECTION_LENGTH) })).toBe(
      'a'.repeat(MIN_SELECTION_LENGTH),
    );
  });

  it('slices overlong text to the maximum instead of rejecting it', () => {
    const long = 'x'.repeat(MAX_SELECTION_LENGTH + 500);
    expect(parseSummarizeText({ type: 'summarize', text: long })).toBe(
      'x'.repeat(MAX_SELECTION_LENGTH),
    );
  });
});
