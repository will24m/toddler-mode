import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Toddler Mode',
    description: "Highlight any text and get a tiny summary explained like you're a toddler.",
    homepage_url: 'https://github.com/will24m/toddler-mode',
    // The floor we actually test against. The on-device Gemini Nano path
    // additionally wants Chrome 138+ and is feature-detected at runtime.
    minimum_chrome_version: '116',
    permissions: ['storage', 'contextMenus'],
    commands: {
      'summarize-selection': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: 'Summarize the selected text',
      },
    },
    // Only the two default provider origins are granted at install. Custom
    // endpoints request their specific origin from the options page at
    // save-time (see optional_host_permissions).
    host_permissions: ['https://api.openai.com/*', 'https://api.anthropic.com/*'],
    // The http entries must cover every loopback host validateEndpoint accepts.
    optional_host_permissions: [
      'https://*/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'http://[::1]/*',
    ],
    action: { default_title: 'Toddler Mode' },
    icons: {
      16: 'icon/16.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
