# 🧸 Toddler Mode

A Chromium (Chrome / Edge / Brave) extension. Highlight any text on a page, click the
little bear that pops up, and get a **tiny summary explained like you're a toddler** —
short words, a few short sentences, no big fancy words. The summary streams in live.

Everything happens *inside the page* — no new tabs or windows.

## Where the AI runs

Toddler Mode is **hybrid**:

1. **On-device first (recommended).** If Chrome's built-in **Gemini Nano** is available, the
   summary is generated **privately on your machine** — no API key, nothing sent to a server.
2. **Cloud fallback.** If on-device AI isn't available (older browser, unsupported hardware),
   it falls back to a cloud provider you configure (OpenAI-compatible or Anthropic).

On-device AI needs desktop Chrome 138+ on capable hardware (~22 GB free disk for the model,
>4 GB VRAM, 16 GB RAM). Not sure? Open the options page — it tells you your status and can
download the model with one click.

## How it works

```text
highlight text  →  🧸 icon appears  →  click it  →  floating bubble streams a toddler summary
```

- **content.js** — detects the selection, shows the icon and the floating bubble (isolated
  in a Shadow DOM so page styles can't break it). Runs the **on-device Gemini Nano** path
  here (the Prompt API can't run in a service worker), and falls back to the cloud port.
- **background.js** — the service worker. Handles the **cloud fallback**: it makes the
  streaming API call (content scripts can't, due to CORS) and pushes tokens back over a
  long-lived port. Handles both OpenAI-compatible and Anthropic SSE formats.
- **options.html / options.js** — on-device status + one-click model setup, plus the cloud
  fallback settings (provider, endpoint, API key, model).

## Install (load unpacked)

1. Generate the icons (one time): `python3 gen_icons.py`
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select this folder.

## Configure

Open the extension's **Options** (right-click the toolbar icon → Options, or
Details → Extension options).

- **On-device AI** — the top section shows whether Gemini Nano is ready. If it says
  "Available to download," click **Set up on-device AI** once. When it's ready you need
  nothing else — no key, fully private.
- **Cloud fallback (optional)** — only needed if on-device AI isn't supported on your device.
  Pick a **provider**, confirm **endpoint** and **model**, paste your **API key**, then **Save**.
  - OpenAI default: `https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`
  - Anthropic default: `https://api.anthropic.com/v1/messages`, model `claude-haiku-4-5`
  - Custom: any OpenAI-compatible endpoint.

Your API key is stored in `chrome.storage.local` (this device only, never synced).
Provider / endpoint / model sync across your signed-in browsers.

## Use

Highlight some text → click the 🧸 → read the bubble. Press `Esc`, click the ✕, or click
elsewhere to close it.

## Tweak the voice

The toddler personality is the `TODDLER_PROMPT` string. It appears in both
[content.js](content.js) (on-device path) and [background.js](background.js) (cloud path) —
edit both to keep them in sync.

## Notes

- No build step, no npm, no dependencies — plain files loaded directly.
- The icons are simple generated placeholders; swap in your own `icons/icon{16,48,128}.png`
  anytime.
