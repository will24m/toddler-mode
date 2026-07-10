import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Toddler Mode',
    description: "Highlight any text and get a tiny summary explained like you're a toddler.",
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Toddler Mode' },
    icons: {
      16: 'icon/16.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
});
