# Toddler Mode — Privacy Policy

_Last updated: 2026-07-10_

Toddler Mode is a browser extension that summarizes text you highlight, in
toddler-simple language. This policy describes everything the extension does
with data. The short version: **the developer collects nothing, ever.**

## What the extension processes

- **Text you highlight.** When — and only when — you click the 🧸 icon, the
  text you highlighted is sent to an AI model to be summarized:
  - **On-device (default when available).** If Chrome's built-in Gemini Nano
    is available, the summary is generated entirely on your machine. The
    selected text never leaves your device.
  - **Cloud fallback (only if you configure it).** If on-device AI is not
    available, the selected text is sent directly from your browser to the AI
    provider **you** configured in the extension's options (e.g. OpenAI or
    Anthropic), using **your** API key. It is never sent anywhere else, and
    never sent without your click.
- **Your settings.** Provider, endpoint URL, and model name are stored with
  `chrome.storage.sync` (so they follow your signed-in browser profile). Your
  **API key** is stored with `chrome.storage.local` — it stays on the device,
  is never synced, and is read only by the extension's own service worker and
  options page.

## What the developer collects

Nothing. The extension has no analytics, no telemetry, no error reporting, no
ads, and no server of its own. No browsing history, page content, or personal
information is ever transmitted to the developer or any third party chosen by
the developer.

## Third parties

If you configure the cloud fallback, your highlighted text and API key are
sent to the provider endpoint you chose, subject to that provider's own
privacy policy (e.g. OpenAI's or Anthropic's). The extension refuses
non-HTTPS endpoints (except localhost) and never lets the request follow a
redirect to a different origin.

## Data retention

The extension retains nothing beyond the settings described above. Summaries
are displayed and discarded; selections are never logged or stored. Removing
the extension deletes its stored settings.

## Changes & contact

Changes to this policy will appear in this file's history at
<https://github.com/will24m/toddler-mode>. Questions or concerns: open an
issue there.
