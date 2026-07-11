// The cloud streaming core: POST the provider request and pump the SSE
// response through the request's line parser. Decoupled from the port and
// from global fetch so the whole path is unit-testable; the background
// wires in the stall watchdog (onActivity) and token delivery (onToken).

import type { ProviderRequest } from '@/utils/providers';
import { createSseLineSplitter } from '@/utils/sse';

export interface StreamOptions {
  onActivity?: () => void; // called once per network read (feeds a watchdog)
  fetchImpl?: typeof fetch;
}

export async function streamCloudSummary(
  request: ProviderRequest,
  signal: AbortSignal,
  onToken: (token: string) => void,
  options: StreamOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const res = await fetchImpl(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal,
    // The API key rides in a header; never let it follow a redirect to a
    // different origin. The supported APIs don't redirect anyway.
    redirect: 'error',
  });

  if (!res.ok) {
    const errText = await safeReadText(res);
    throw new Error(`API ${res.status} — ${truncate(errText, 300) || 'request failed'}`);
  }
  if (!res.body) throw new Error('No response stream from the API.');

  const splitter = createSseLineSplitter((line) => {
    const token = request.parseLine(line);
    if (token) onToken(token);
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    options.onActivity?.();
    splitter.push(decoder.decode(value, { stream: true }));
  }
  splitter.push(decoder.decode());
  splitter.flush();
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
