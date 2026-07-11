import { describe, expect, it } from 'vitest';
import { endpointOriginPattern, validateEndpoint } from '@/utils/endpoint';

describe('validateEndpoint', () => {
  it('accepts https URLs', () => {
    expect(validateEndpoint('https://api.openai.com/v1/chat/completions')).toBeNull();
    expect(validateEndpoint('https://my-llm.example.com:8443/v1/chat/completions')).toBeNull();
  });

  it('accepts plain http only for loopback hosts (local LLMs)', () => {
    expect(validateEndpoint('http://localhost:11434/v1/chat/completions')).toBeNull();
    expect(validateEndpoint('http://127.0.0.1:8080/v1/chat/completions')).toBeNull();
    expect(validateEndpoint('http://[::1]:8080/v1/chat/completions')).toBeNull();
  });

  it('rejects plain http to remote hosts', () => {
    expect(validateEndpoint('http://api.example.com/v1')).toMatch(/https/i);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(validateEndpoint('https://user:pass@api.example.com/v1')).toMatch(/credentials/i);
    expect(validateEndpoint('https://user@api.example.com/v1')).toMatch(/credentials/i);
  });

  it('rejects non-http(s) schemes and unparseable URLs', () => {
    expect(validateEndpoint('ftp://api.example.com/v1')).not.toBeNull();
    expect(validateEndpoint('file:///etc/passwd')).not.toBeNull();
    expect(validateEndpoint('not a url')).not.toBeNull();
    expect(validateEndpoint('')).not.toBeNull();
  });
});

describe('endpointOriginPattern', () => {
  it('returns the origin match pattern for permissions requests', () => {
    expect(endpointOriginPattern('https://api.openai.com/v1/chat/completions')).toBe(
      'https://api.openai.com/*',
    );
    expect(endpointOriginPattern('http://localhost:11434/v1/chat/completions')).toBe(
      'http://localhost/*',
    );
  });

  it('drops the port — match patterns cannot carry one', () => {
    expect(endpointOriginPattern('https://my-llm.example.com:8443/v1')).toBe(
      'https://my-llm.example.com/*',
    );
  });

  it('keeps IPv6 hosts bracketed, matching the manifest pattern syntax', () => {
    expect(endpointOriginPattern('http://[::1]:8080/v1')).toBe('http://[::1]/*');
  });

  it('returns null for unparseable URLs', () => {
    expect(endpointOriginPattern('not a url')).toBeNull();
    expect(endpointOriginPattern('')).toBeNull();
  });
});
