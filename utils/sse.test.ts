import { describe, expect, it } from 'vitest';
import { createSseLineSplitter, parseAnthropicLine, parseOpenAILine } from '@/utils/sse';

describe('createSseLineSplitter', () => {
  it('emits complete lines and buffers the trailing partial', () => {
    const lines: string[] = [];
    const splitter = createSseLineSplitter((l) => lines.push(l));
    splitter.push('data: a\ndata: b\ndata: par');
    expect(lines).toEqual(['data: a', 'data: b']);
    splitter.push('tial\n');
    expect(lines).toEqual(['data: a', 'data: b', 'data: partial']);
  });

  it('strips CRLF endings', () => {
    const lines: string[] = [];
    const splitter = createSseLineSplitter((l) => lines.push(l));
    splitter.push('data: x\r\ndata: y\r\n');
    expect(lines).toEqual(['data: x', 'data: y']);
  });

  it('flush emits the remaining buffer once', () => {
    const lines: string[] = [];
    const splitter = createSseLineSplitter((l) => lines.push(l));
    splitter.push('data: tail');
    splitter.flush();
    splitter.flush();
    expect(lines).toEqual(['data: tail']);
  });
});

describe('parseOpenAILine', () => {
  it('extracts delta content', () => {
    const line = 'data: {"choices":[{"delta":{"content":"hi"}}]}';
    expect(parseOpenAILine(line)).toBe('hi');
  });

  it('returns null for [DONE], non-data lines, and malformed JSON', () => {
    expect(parseOpenAILine('data: [DONE]')).toBeNull();
    expect(parseOpenAILine('event: message')).toBeNull();
    expect(parseOpenAILine('')).toBeNull();
    expect(parseOpenAILine('data: {not json')).toBeNull();
    expect(parseOpenAILine('data: {"choices":[{"delta":{}}]}')).toBeNull();
  });
});

describe('parseAnthropicLine', () => {
  it('extracts text_delta content', () => {
    const line =
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"yo"}}';
    expect(parseAnthropicLine(line)).toBe('yo');
  });

  it('returns null for other event types, non-data lines, and malformed JSON', () => {
    expect(parseAnthropicLine('data: {"type":"message_start"}')).toBeNull();
    expect(parseAnthropicLine('event: content_block_delta')).toBeNull();
    expect(parseAnthropicLine('data: {broken')).toBeNull();
    expect(parseAnthropicLine('data:')).toBeNull();
  });
});
