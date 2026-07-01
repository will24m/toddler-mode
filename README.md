# 🧸 Toddler Mode

A Chromium (Chrome / Edge / Brave) extension. Highlight any text on a page, click the
little bear that pops up, and get a **tiny summary explained like you're a toddler** —
short words, a few short sentences, no big fancy words. The summary streams in live from
an AI provider you choose.

Everything happens *inside the page* — no new tabs or windows.

## How it works

```text
highlight text  →  🧸 icon appears  →  click it  →  floating bubble streams a toddler summary
```

- **content.js** — detects the selection, shows the icon and the floating bubble (isolated
  in a Shadow DOM so page styles can't break it).
- **background.js** — the service worker. It makes the streaming API call (content scripts
  can't, due to CORS) and pushes tokens back over a long-lived port. Handles both
  OpenAI-compatible and Anthropic SSE formats.
- **options.html / options.js** — settings: provider, endpoint, API key, model.

## Install (load unpacked)

1. Generate the icons (one time): `python3 gen_icons.py`
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select this folder.

## Configure

1. Open the extension's **Options** (right-click the toolbar icon → Options, or
   Details → Extension options).
2. Pick a **provider**, confirm the **endpoint** and **model**, paste your **API key**.
   - OpenAI default: `https://api.openai.com/v1/chat/completions`, model `gpt-4o-mini`
   - Anthropic default: `https://api.anthropic.com/v1/messages`, model `claude-haiku-4-5`
   - Custom: any OpenAI-compatible endpoint.
3. **Save.**

Your API key is stored in `chrome.storage.local` (this device only, never synced).
Provider / endpoint / model sync across your signed-in browsers.

## Use

Highlight some text → click the 🧸 → read the bubble. Press `Esc`, click the ✕, or click
elsewhere to close it.

## Tweak the voice

The toddler personality is a single prompt string — `TODDLER_PROMPT` near the top of
[background.js](background.js). Edit it to change the tone.

## Notes

- No build step, no npm, no dependencies — plain files loaded directly.
- The icons are simple generated placeholders; swap in your own `icons/icon{16,48,128}.png`
  anytime.
