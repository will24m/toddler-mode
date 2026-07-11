# Critique Response — Design

**Date:** 2026-07-11
**Status:** Approved (autonomous session; user directive: "heavily critique the extension, and then act on it")

## Critique acted on

1. The selection icon is invasive and can't be disabled.
2. The icon is the only trigger — no context menu, no keyboard shortcut.
3. No way to test the cloud configuration from the options page.
4. Selections over 8000 chars are truncated silently.
5. After an extension update, old content scripts throw on `runtime.connect`,
   stranding the bubble with spinning dots.
6. The background streaming path (the most complex code) is untested because
   it's welded to `fetch` and the port.
7. Options form ignores Enter.

## Design

### Alternate triggers + quiet mode (fixes 1, 2)

- Manifest: add `contextMenus` permission and a `commands` entry
  (`summarize-selection`, suggested `Alt+Shift+T`).
- Background: create the "🧸 Explain like I'm a toddler" selection context-menu
  item in `onInstalled`; on menu click or command, send
  `{ type: 'trigger-summarize' }` to the active tab.
- Content: on that message, run the same open-bubble path the icon uses
  (selection is still live during a context-menu click).
- New synced setting `sync:showIcon` (fallback `true`) in `utils/config.ts`;
  content reads it at start and watches for changes; when off, the icon never
  shows but menu/shortcut still work. Options page gets the checkbox.
- Store-listing doc gains the `contextMenus` justification.

### Save & test (fixes 3)

Options page gets a **Save & test** button beside Save. It saves, then opens
the real `summarize` port and sends a tiny fixed text; first `chunk`/`done` →
"It works!", `error`/`not-configured` → the message, 30s timeout → warning.
Zero new background code — it exercises the exact path the bubble uses,
including the permission check.

### Truncation notice (fixes 4)

`Bubble.setNote(text)` — a persistent note line (distinct from the transient
status). The content script passes `truncated: true` when it cut the
selection; the session sets "That was a lot of words — I read the first
part!". Component-tested.

### Update-proofing (fixes 5)

Wrap `browser.runtime.connect` in try/catch in `SummarySession.startCloud`;
on throw, show "Toddler Mode was updated — reload the page and try again."
(no retry button; retrying can't succeed).

### Testable streaming core (fixes 6)

Extract the fetch/SSE-pump loop from `entrypoints/background.ts` into
`utils/cloud-stream.ts`:

`streamCloudSummary(request, signal, onToken, onActivity?, fetchImpl = fetch)`
— performs the POST (`redirect: 'error'`), throws on non-OK with truncated
body text, pumps the stream through `createSseLineSplitter` + the request's
parser, calls `onToken` per token and `onActivity` per read (feeds the
background's stall watchdog). The background keeps config/permission checks,
the watchdog, token coalescing, and port posting. Unit tests fake `fetch`
with a `ReadableStream` SSE body: happy path, HTTP error, missing body.

### Options form (fixes 7)

Pressing Enter in any cloud-settings field triggers Save.

## Explicitly skipped

- Firefox/cross-browser build, iframe selections (`all_frames`), draggable
  bubble, user-editable prompt, real icon art — scope or design decisions
  that need the user.
