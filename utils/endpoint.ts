// Endpoint URL rules for the cloud fallback. Pure — no browser APIs — so the
// options page and the background enforce the exact same policy.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Returns a human-readable problem with the URL, or null if it's acceptable.
// Plain http is only allowed to loopback hosts (local LLMs like Ollama) —
// anywhere else the API key would cross the network unencrypted.
export function validateEndpoint(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'The endpoint must be a full URL, like https://api.openai.com/v1/chat/completions.';
  }
  if (parsed.username || parsed.password) {
    return 'The endpoint URL must not contain credentials — put the API key in the key field.';
  }
  if (parsed.protocol === 'https:') return null;
  // URL.hostname keeps IPv6 brackets: new URL('http://[::1]/').hostname === '[::1]'.
  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return null;
  }
  if (parsed.protocol === 'http:') {
    return 'The endpoint must use https (plain http is only allowed for localhost).';
  }
  return 'The endpoint must be an http(s) URL.';
}

// The match pattern covering the endpoint's origin, for the
// browser.permissions API (e.g. "https://api.example.com/*").
// Match patterns cannot carry a port — a host grant covers all its ports.
export function endpointOriginPattern(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return null;
  }
}
