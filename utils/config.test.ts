import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { isConfigComplete, loadCloudConfig, PROVIDER_DEFAULTS, providerItem } from '@/utils/config';

describe('config', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('exposes verbatim provider defaults', () => {
    expect(PROVIDER_DEFAULTS.openai).toEqual({
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
    });
    expect(PROVIDER_DEFAULTS.anthropic).toEqual({
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-haiku-4-5',
    });
    expect(PROVIDER_DEFAULTS.custom).toEqual({ endpoint: '', model: '' });
  });

  it('loads fallback values when nothing is stored', async () => {
    const config = await loadCloudConfig();
    expect(config).toEqual({ provider: 'openai', endpoint: '', model: '', apiKey: '' });
  });

  it('round-trips values and keeps the legacy raw storage keys', async () => {
    await providerItem.setValue('anthropic');
    const config = await loadCloudConfig();
    expect(config.provider).toBe('anthropic');
    // Legacy-compat guarantee: same raw key in chrome.storage.sync as the old JS used.
    const raw = await fakeBrowser.storage.sync.get('provider');
    expect(raw.provider).toBe('anthropic');
  });

  it('validates completeness', () => {
    const complete = {
      provider: 'openai' as const,
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    };
    expect(isConfigComplete(complete)).toBe(true);
    expect(isConfigComplete({ ...complete, apiKey: '' })).toBe(false);
    expect(isConfigComplete({ ...complete, endpoint: '' })).toBe(false);
    expect(isConfigComplete({ ...complete, model: '' })).toBe(false);
  });
});
