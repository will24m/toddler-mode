import '@/assets/options.css';
import {
  apiKeyItem,
  endpointItem,
  loadCloudConfig,
  modelItem,
  PROVIDER_DEFAULTS,
  type Provider,
  providerItem,
  showIconItem,
} from '@/utils/config';
import { downloadProgressPercent } from '@/utils/download-progress';
import { endpointOriginPattern, validateEndpoint } from '@/utils/endpoint';
import { type PortResponse, SUMMARIZE_PORT } from '@/utils/messaging';

const providerEl = document.getElementById('provider') as HTMLSelectElement;
const endpointEl = document.getElementById('endpoint') as HTMLInputElement;
const apiKeyEl = document.getElementById('apiKey') as HTMLInputElement;
const modelEl = document.getElementById('model') as HTMLInputElement;
const saveEl = document.getElementById('save') as HTMLButtonElement;
const saveTestEl = document.getElementById('saveTest') as HTMLButtonElement;
const showIconEl = document.getElementById('showIcon') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLSpanElement;
const toggleKeyEl = document.getElementById('toggleKey') as HTMLButtonElement;
const localStatusEl = document.getElementById('localStatus') as HTMLDivElement;
const downloadLocalEl = document.getElementById('downloadLocal') as HTMLButtonElement;

// ---- On-device AI (Gemini Nano) status + setup -------------------------

async function refreshLocalStatus(): Promise<void> {
  if (typeof LanguageModel === 'undefined') {
    localStatusEl.textContent =
      '❌ Not available in this browser — the cloud fallback will be used.';
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
    localStatusEl.textContent =
      '❌ Not supported on this device — the cloud fallback will be used.';
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
          localStatusEl.textContent = `⬇ Downloading… ${downloadProgressPercent(e)}%`;
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

// When the provider changes, fill in that provider's defaults — but never
// clobber a value the user typed themselves (empty or another provider's
// default is fair game; anything else is theirs).
providerEl.addEventListener('change', () => {
  const d = PROVIDER_DEFAULTS[providerEl.value as Provider] ?? PROVIDER_DEFAULTS.custom;
  if (isDefaultOrEmpty(endpointEl.value.trim(), 'endpoint')) endpointEl.value = d.endpoint;
  if (isDefaultOrEmpty(modelEl.value.trim(), 'model')) modelEl.value = d.model;
});

function isDefaultOrEmpty(value: string, field: 'endpoint' | 'model'): boolean {
  return !value || Object.values(PROVIDER_DEFAULTS).some((d) => d[field] === value);
}

toggleKeyEl.setAttribute('aria-pressed', 'false');
toggleKeyEl.addEventListener('click', () => {
  const showing = apiKeyEl.type === 'text';
  apiKeyEl.type = showing ? 'password' : 'text';
  toggleKeyEl.textContent = showing ? 'Show' : 'Hide';
  toggleKeyEl.setAttribute('aria-pressed', String(!showing));
});

// Saves everything; returns false when validation blocked the save.
// `quiet` suppresses the success flash (Save & test shows its own status).
async function doSave(quiet = false): Promise<boolean> {
  const endpoint = endpointEl.value.trim();

  if (endpoint) {
    const problem = validateEndpoint(endpoint);
    if (problem) {
      flashStatus(problem, { warn: true });
      return false;
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
    showIconItem.setValue(showIconEl.checked),
  ]);
  if (permissionWarning) {
    flashStatus(permissionWarning, { warn: true });
  } else if (!quiet) {
    flashStatus('Saved! 🎉');
  }
  return true;
}

saveEl.addEventListener('click', () => void doSave());

// Save, then exercise the real summarize path end to end — port, config,
// permission check, provider request, streaming — with a tiny prompt.
saveTestEl.addEventListener('click', async () => {
  if (!(await doSave(true))) return;
  testConnection();
});

const TEST_TIMEOUT_MS = 30_000;
function testConnection(): void {
  statusEl.classList.remove('warn');
  statusEl.textContent = 'Testing… 🧪';
  saveEl.disabled = true;
  saveTestEl.disabled = true;
  const port = browser.runtime.connect({ name: SUMMARIZE_PORT });
  let settled = false;
  const timer = setTimeout(() => {
    finish('No answer after 30 seconds — check the endpoint and key.', true);
  }, TEST_TIMEOUT_MS);
  function finish(message: string, warn: boolean): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    saveEl.disabled = false;
    saveTestEl.disabled = false;
    try {
      port.disconnect();
    } catch {
      // already gone
    }
    flashStatus(message, { warn });
  }
  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as PortResponse;
    if (msg.type === 'chunk' || msg.type === 'done') finish('It works! 🎉', false);
    else if (msg.type === 'not-configured')
      finish('Fill in endpoint, model, and API key first.', true);
    else if (msg.type === 'error') finish(msg.message, true);
  });
  port.postMessage({ type: 'summarize', text: 'Say hello in a few short words.' });
}

// Enter in any text field saves — the form-iest thing a form can do.
document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (e.key === 'Enter' && target instanceof HTMLInputElement && target.type !== 'checkbox') {
    e.preventDefault();
    void doSave();
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
  // Success confirmations fade; warnings stay until the user acts again —
  // a problem message that vanishes on its own is a problem missed.
  if (opts.warn) return;
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.classList.remove('warn');
  }, 2000);
}

// Load saved settings on open.
async function load(): Promise<void> {
  const [{ provider, endpoint, model, apiKey }, showIcon] = await Promise.all([
    loadCloudConfig(),
    showIconItem.getValue(),
  ]);
  providerEl.value = provider;
  const d = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.custom;
  endpointEl.value = endpoint || d.endpoint;
  modelEl.value = model || d.model;
  apiKeyEl.value = apiKey;
  showIconEl.checked = showIcon;
}

void load();
void refreshLocalStatus();
