// Streaming SSE helpers shared by the background cloud path.
// Pure functions — no browser APIs — so they stay unit-testable.

export type SseLineParser = (line: string) => string | null;

// SSE frames are newline-delimited; keep the trailing partial line buffered
// until the next chunk (or flush) completes it. Tolerates CRLF endings.
export function createSseLineSplitter(onLine: (line: string) => void) {
  let buffer = '';

  function stripCr(line: string): string {
    return line.endsWith('\r') ? line.slice(0, -1) : line;
  }

  return {
    push(chunkText: string): void {
      buffer += chunkText;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) onLine(stripCr(line));
    },
    flush(): void {
      if (buffer) onLine(stripCr(buffer));
      buffer = '';
    },
  };
}

// OpenAI: `data: {"choices":[{"delta":{"content":"..."}}]}` / `data: [DONE]`.
export const parseOpenAILine: SseLineParser = (line) => {
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (!data || data === '[DONE]') return null;
  try {
    const json = JSON.parse(data);
    return json?.choices?.[0]?.delta?.content || null;
  } catch {
    return null;
  }
};

// Anthropic: `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`.
export const parseAnthropicLine: SseLineParser = (line) => {
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (!data) return null;
  try {
    const json = JSON.parse(data);
    if (json?.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return json.delta.text || null;
    }
    return null;
  } catch {
    return null;
  }
};
