import '@/assets/options.css';
import {
  PROVIDER_DEFAULTS,
  apiKeyItem,
  endpointItem,
  loadCloudConfig,
  modelItem,
  providerItem,
  type Provider,
} from '@/utils/config';
import { endpointOriginPattern, validateEndpoint } from '@/utils/endpoint';

const providerEl = document.getElementById('provider') as HTMLSelectElement;
const endpointEl = document.getElementById('endpoint') as HTMLInputElement;
const apiKeyEl = document.getElementById('apiKey') as HTMLInputElement;
const modelEl = document.getElementById('model') as HTMLInputElement;
const saveEl = document.getElementById('save') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const toggleKeyEl = document.getElementById('toggleKey') as HTMLButtonElement;
const localStatusEl = document.getElementById('localStatus') as HTMLDivElement;
const downloadLocalEl = document.getElementById('downloadLocal') as HTMLButtonElement;

// ---- On-device AI (Gemini Nano) status + setup -------------------------

async function refreshLocalStatus(): Promise<void> {
  if (typeof LanguageModel === 'undefined') {
    localStatusEl.textContent = '❌ Not available in this browser — the cloud fallback will be used.';
    downloadLocalEl.style.display = 'none';
    return;
  }
  let availability: LanguageModelAvailability;
  try {
    availability = await LanguageModel.availability();
  } catch {
    availability = 'unavailable';
  }
  if (availability === 'available') {
    localStatusEl.textContent = '✅ Ready — summaries run privately on your device.';
    downloadLocalEl.style.display = 'none';
  } else if (availability === 'downloadable') {
    localStatusEl.textContent = '⬇ Available to download (a one-time ~2 GB model).';
    downloadLocalEl.style.display = 'inline-block';
  } else if (availability === 'downloading') {
    localStatusEl.textContent = '⬇ Downloading the model…';
    downloadLocalEl.style.display = 'none';
  } else {
    localStatusEl.textContent = '❌ Not supported on this device — the cloud fallback will be used.';
    downloadLocalEl.style.display = 'none';
  }
}

downloadLocalEl.addEventListener('click', async () => {
  downloadLocalEl.disabled = true;
  try {
    // The button click gives the user activation needed to start the download.
    const session = await LanguageModel.create({
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const frac = e && e.total ? e.loaded / e.total : e ? e.loaded : 0;
          localStatusEl.textContent = `⬇ Downloading… ${Math.round((frac || 0) * 100)}%`;
        });
      },
    });
    session.destroy();
    localStatusEl.textContent = '✅ Ready — summaries run privately on your device.';
    downloadLocalEl.style.display = 'none';
  } catch (err) {
    localStatusEl.textContent = `Couldn't set up on-device AI: ${
      (err as { message?: string } | null)?.message || String(err)
    }`;
  } finally {
    downloadLocalEl.disabled = false;
  }
});

// ---- Cloud fallback settings --------------------------------------------

// When the provider changes, fill in that provider's defaults.
providerEl.addEventListener('change', () => {
  const d = PROVIDER_DEFAULTS[providerEl.value as Provider] ?? PROVIDER_DEFAULTS.custom;
  endpointEl.value = d.endpoint;
  modelEl.value = d.model;
});

toggleKeyEl.addEventListener('click', () => {
  const showing = apiKeyEl.type === 'text';
  apiKeyEl.type = showing ? 'password' : 'text';
  toggleKeyEl.textContent = showing ? 'Show' : 'Hide';
});

saveEl.addEventListener('click', async () => {
  const endpoint = endpointEl.value.trim();

  if (endpoint) {
    const problem = validateEndpoint(endpoint);
    if (problem) {
      flashStatus(problem, { warn: true });
      return;
    }
  }

  // Custom endpoints need a host permission the manifest doesn't grant.
  // Requesting here keeps the install-time grants down to the two default
  // provider origins — and this click is the user gesture the request needs.
  const permissionWarning = endpoint ? await ensureEndpointPermission(endpoint) : null;

  // Provider/endpoint/model are fine to sync; the key stays local only.
  await Promise.all([
    providerItem.setValue(providerEl.value as Provider),
    endpointItem.setValue(endpoint),
    modelItem.setValue(modelEl.value.trim()),
    apiKeyItem.setValue(apiKeyEl.value.trim()),
  ]);
  if (permissionWarning) {
    flashStatus(permissionWarning, { warn: true });
  } else {
    flashStatus('Saved! 🎉');
  }
});

// Returns a warning message if the endpoint's origin could not be granted.
async function ensureEndpointPermission(endpoint: string): Promise<string | null> {
  const origin = endpointOriginPattern(endpoint);
  if (!origin) return null; // validateEndpoint already vouched for the URL
  try {
    // request() resolves true without prompting when the origin is already
    // granted, so it's called directly — a preceding awaited contains() call
    // could burn the click's transient user-gesture activation.
    if (await browser.permissions.request({ origins: [origin] })) return null;
  } catch {
    // Fall through — e.g. the origin isn't coverable by optional_host_permissions.
  }
  return `Saved, but without permission to reach ${origin} the cloud fallback won't work.`;
}

function flashStatus(text: string, opts: { warn?: boolean } = {}): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('warn', Boolean(opts.warn));
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.classList.remove('warn');
  }, opts.warn ? 6000 : 2000);
}

// Load saved settings on open.
async function load(): Promise<void> {
  const { provider, endpoint, model, apiKey } = await loadCloudConfig();
  providerEl.value = provider;
  const d = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.custom;
  endpointEl.value = endpoint || d.endpoint;
  modelEl.value = model || d.model;
  apiKeyEl.value = apiKey;
}

void load();
void refreshLocalStatus();
