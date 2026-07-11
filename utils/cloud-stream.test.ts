import { describe, expect, it, vi } from 'vitest';
import { streamCloudSummary } from '@/utils/cloud-stream';
import type { ProviderRequest } from '@/utils/providers';
import { parseOpenAILine } from '@/utils/sse';

function sseResponse(lines: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

const request: ProviderRequest = {
  url: 'https://api.example.com/v1/chat/completions',
  headers: { 'Content-Type': 'application/json' },
  body: { model: 'm' },
  parseLine: parseOpenAILine,
};

describe('streamCloudSummary', () => {
  it('pumps SSE lines through the parser and emits tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hello "}}]}',
        'data: {"choices":[{"delta":{"content":"bear"}}]}',
        'data: [DONE]',
      ]),
    );
    const tokens: string[] = [];
    const activity = vi.fn();
    await streamCloudSummary(request, new AbortController().signal, (t) => tokens.push(t), {
      onActivity: activity,
      fetchImpl,
    });
    expect(tokens).toEqual(['Hello ', 'bear']);
    expect(activity).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(
      request.url,
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
  });

  it('throws with status and truncated body text on a non-OK response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(`x${'y'.repeat(400)}`, { status: 401 }));
    await expect(
      streamCloudSummary(request, new AbortController().signal, () => {}, { fetchImpl }),
    ).rejects.toThrow(/API 401 — x/);
  });

  it('throws when the response has no body stream', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      streamCloudSummary(request, new AbortController().signal, () => {}, { fetchImpl }),
    ).rejects.toThrow(/No response stream/);
  });
});
