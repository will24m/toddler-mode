import { describe, expect, it } from 'vitest';
import { TODDLER_PROMPT } from '@/utils/prompt';
import { buildRequest } from '@/utils/providers';
import { parseAnthropicLine, parseOpenAILine } from '@/utils/sse';

const base = { endpoint: '', model: '', apiKey: 'sk-test' };

describe('buildRequest', () => {
  it('builds an Anthropic request with verbatim headers and max_tokens 200', () => {
    const req = buildRequest('some text', {
      ...base,
      provider: 'anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-haiku-4-5',
    });
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(req.body).toEqual({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      stream: true,
      system: TODDLER_PROMPT,
      messages: [{ role: 'user', content: 'some text' }],
    });
    expect(req.parseLine).toBe(parseAnthropicLine);
  });

  it('builds an OpenAI-compatible request with max_tokens 200', () => {
    const req = buildRequest('some text', {
      ...base,
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
    });
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
    });
    expect(req.body).toEqual({
      model: 'gpt-4o-mini',
      stream: true,
      max_tokens: 200,
      messages: [
        { role: 'system', content: TODDLER_PROMPT },
        { role: 'user', content: 'some text' },
      ],
    });
    expect(req.parseLine).toBe(parseOpenAILine);
  });

  it('treats custom provider as OpenAI-compatible and falls back to default URLs', () => {
    const custom = buildRequest('t', { ...base, provider: 'custom', model: 'local-llm' });
    expect(custom.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(custom.parseLine).toBe(parseOpenAILine);

    const anthropic = buildRequest('t', { ...base, provider: 'anthropic', model: 'm' });
    expect(anthropic.url).toBe('https://api.anthropic.com/v1/messages');
  });
});
