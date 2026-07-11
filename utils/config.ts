import { storage } from '#imports';

export type Provider = 'openai' | 'anthropic' | 'custom';

export interface CloudConfig {
  provider: Provider;
  endpoint: string;
  model: string;
  apiKey: string;
}

// Sensible per-provider defaults for the endpoint + model fields.
export const PROVIDER_DEFAULTS: Record<Provider, { endpoint: string; model: string }> = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5',
  },
  custom: { endpoint: '', model: '' },
};

// Keys match the legacy chrome.storage usage exactly, so existing users'
// settings survive the migration. Provider/endpoint/model sync; the key
// stays local only.
export const providerItem = storage.defineItem<Provider>('sync:provider', { fallback: 'openai' });
export const endpointItem = storage.defineItem<string>('sync:endpoint', { fallback: '' });
export const modelItem = storage.defineItem<string>('sync:model', { fallback: '' });
export const apiKeyItem = storage.defineItem<string>('local:apiKey', { fallback: '' });
// Quiet mode: when false, the selection icon never appears — the context
// menu and keyboard shortcut become the triggers.
export const showIconItem = storage.defineItem<boolean>('sync:showIcon', { fallback: true });

export async function loadCloudConfig(): Promise<CloudConfig> {
  const [provider, endpoint, model, apiKey] = await Promise.all([
    providerItem.getValue(),
    endpointItem.getValue(),
    modelItem.getValue(),
    apiKeyItem.getValue(),
  ]);
  return { provider, endpoint, model, apiKey };
}

export function isConfigComplete(c: CloudConfig): boolean {
  return Boolean(c.provider && c.endpoint && c.model && c.apiKey);
}
