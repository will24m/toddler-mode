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

- **entrypoints/content/** — detects the selection (mouse and keyboard), shows the icon and
  the floating bubble (isolated in a Shadow DOM). Runs the **on-device Gemini Nano** path
  here (the Prompt API can't run in a service worker), and falls back to the cloud port.
- **entrypoints/background.ts** — the service worker. Owns the cloud config **and the API
  key** (the content script only ever sends the selected text), makes the streaming API
  call, aborts it if the stream stalls for 20s, and pushes tokens back over a long-lived
  port. Handles both OpenAI-compatible and Anthropic SSE formats.
- **entrypoints/options/** — on-device status + one-click model setup, plus the cloud
  fallback settings (provider, endpoint, API key, model).
- **utils/** — pure, unit-tested modules: the toddler prompt, config store, SSE parsing,
  streaming delta math, positioning math, and the typed messaging protocol.
- **components/** — vanilla DOM builders for the icon and bubble.
- **assets/** — the CSS for the bubble and the options page.

Built with [WXT](https://wxt.dev) on its canonical flat project structure. The
`composables/` (Vue) and `hooks/` (React/Solid) directories are intentionally absent —
this project is vanilla TypeScript. `modules/` and `app.config.ts` appear when needed.

## Develop

```bash
npm install        # also runs `wxt prepare`
npm run dev        # launches Chrome with the extension + HMR
npm test           # Vitest unit tests
npm run check      # TypeScript (tsc --noEmit)
npm run lint       # Biome lint + format check
npm run format     # Biome auto-fix
npm run build      # production build into .output/chrome-mv3
npm run zip        # store-ready zip
```

CI (GitHub Actions) runs lint, tests, typecheck, and the build on every push;
Dependabot files weekly dependency-update PRs.

## Install (from a build)

1. `npm install && npm run build`
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select `.output/chrome-mv3/`.

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
  - Custom: any OpenAI-compatible endpoint (HTTPS required; plain HTTP allowed only for
    `localhost`, e.g. Ollama). Saving a custom endpoint prompts once for permission to
    reach that origin.

Your API key is stored in `chrome.storage.local` (this device only, never synced) and is
only ever read by the background service worker. Provider / endpoint / model sync across
your signed-in browsers.

## Privacy & security

The developer collects **nothing** — no analytics, no telemetry, no server. Full policy:
[PRIVACY.md](PRIVACY.md). Chrome Web Store submission notes (permission justifications,
data-usage disclosures): [docs/store-listing.md](docs/store-listing.md).

Hardening built in:

- Host permissions are scoped to the two default provider origins; custom endpoints get a
  per-origin grant at save-time (`optional_host_permissions`) instead of a blanket
  `<all_urls>`.
- The API key never leaves the background service worker; the content script only ever
  sends the selected text over a typed port, and the background strictly validates every
  message's shape and the 3–8000 char selection bounds before doing anything with it.
- Endpoint URLs are validated on save **and** re-validated before every fetch (HTTPS-only
  except localhost, no embedded credentials), and the fetch uses `redirect: "error"` so
  auth headers can never follow a redirect to another origin.

## Use

Highlight some text (mouse, or Shift+arrows / Ctrl-A) → click the 🧸 → read the bubble.
Press `Esc`, click the ✕, or click elsewhere to close it. The bubble stays anchored to
your selection while you scroll. Clicking the toolbar icon opens the settings page
(it also opens once automatically on first install).

Prefer it quiet? Turn off the selection icon in settings and trigger summaries with the
right-click menu ("🧸 Explain like I'm a toddler") or the keyboard shortcut
(`Alt+Shift+T`, rebindable at `chrome://extensions/shortcuts`). Use **Save & test** in
settings to verify your cloud setup end to end.

## Tweak the voice

The toddler personality is the `TODDLER_PROMPT` string in
[utils/prompt.ts](utils/prompt.ts) — one place, used by both the on-device and cloud paths.

## Notes

- The icons are generated placeholders (`python3 gen_icons.py` regenerates them into
  `public/icon/`); swap in your own PNGs anytime.
- Licensed under the [MIT License](LICENSE).
