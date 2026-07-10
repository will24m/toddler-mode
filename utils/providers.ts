import type { CloudConfig } from '@/utils/config';
import { TODDLER_PROMPT } from '@/utils/prompt';
import { parseAnthropicLine, parseOpenAILine, type SseLineParser } from '@/utils/sse';

const ANTHROPIC_VERSION = '2023-06-01';
// Summaries are 2-3 short sentences; the cap bounds cost if a provider misbehaves.
const MAX_TOKENS = 200;

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  parseLine: SseLineParser;
}

// Build the provider-specific request and the matching SSE line parser.
export function buildRequest(text: string, config: CloudConfig): ProviderRequest {
  if (config.provider === 'anthropic') {
    return {
      url: config.endpoint || 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: config.model,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: TODDLER_PROMPT,
        messages: [{ role: 'user', content: text }],
      },
      parseLine: parseAnthropicLine,
    };
  }

  // OpenAI-compatible (also used for "custom" endpoints).
  return {
    url: config.endpoint || 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      stream: true,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: TODDLER_PROMPT },
        { role: 'user', content: text },
      ],
    },
    parseLine: parseOpenAILine,
  };
}
