# Toddler Mode — WXT Migration Design

**Date:** 2026-07-09
**Status:** Approved
**Goal:** Migrate the extension to WXT (TypeScript + Vite) using WXT's standard flat
project structure, and use the migration to fix the reliability and correctness
problems in the current code. User-visible behavior stays identical.

## Context

Toddler Mode is a Chromium MV3 extension (~750 lines of plain JS across
`content.js`, `background.js`, `options.js`). Highlight text → 🧸 icon → floating
bubble streams a toddler-level summary. Hybrid AI: on-device Gemini Nano
(Prompt API, content-script side) first, cloud fallback (OpenAI-compatible or
Anthropic, streamed over a long-lived port through the service worker) second.

Problems this migration fixes:

1. **API key transits every page.** `content.js` reads `local:apiKey` on every
   summarize and ships it over the port to the service worker.
2. **Duplicated prompt.** `TODDLER_PROMPT` exists in both `content.js` and
   `background.js`; the README documents "edit both to keep them in sync."
3. **No request timeout.** A stalled cloud stream leaves bouncing dots forever.
4. **Scroll strands the bubble.** Fixed-position bubble stays frozen mid-viewport
   while the page scrolls away; a code comment promises behavior ("drop the
   bubble") that the code doesn't implement.
5. **Keyboard selections never trigger the icon** — only `mouseup` is handled.
6. **Fragile untested logic.** SSE parsing, streaming-delta math, and positioning
   math live inline in extension-only files; no tests can exercise them.
7. **Lifecycle sprawl.** Six mutable module-level variables track session state in
   `content.js`; abort/cleanup paths are easy to leak.
8. **Errors stack.** `showError` appends a node per error instead of replacing.
9. **Inconsistent token caps.** Anthropic requests set `max_tokens: 200`; OpenAI
   requests set no cap.

## Decisions

- **Framework:** WXT, npm, strict TypeScript, vanilla DOM (no React/Vue — the
  bubble is ~100 lines of DOM; WXT is framework-agnostic).
- **Layout:** the full canonical WXT flat structure is adopted as-is (no
  `srcDir`), and every existing artifact is refitted into its canonical slot —
  CSS into `assets/`, UI builders into `components/`, pure logic into `utils/`,
  entrypoints into `entrypoints/`, static icons into `public/`. Framework-only
  directories (`composables/` for Vue, `hooks/` for React/Solid) are documented
  as N/A for vanilla TS and created only if a framework is ever adopted.
- **Testing:** Vitest with WXT's `WxtVitest` plugin, unit tests over `utils/`.
  No e2e in this phase; manual smoke checklist instead.
- **Linting:** skipped for now (strict TS covers most of it); optional follow-up.
- **Cloud calls stay raw `fetch`** with existing headers
  (`anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access:
  true` for Anthropic; `Authorization: Bearer` for OpenAI-compatible). Correct
  pattern for a bring-your-own-key extension; no SDK dependency.
- **Defaults preserved:** models `claude-haiku-4-5` / `gpt-4o-mini`, endpoints,
  the toddler prompt text, and all visual styling.
- **Settings survive migration:** WXT storage keys `sync:provider`,
  `sync:endpoint`, `sync:model`, `local:apiKey` map to the exact
  `chrome.storage` keys the extension already uses. No data migration needed.

## Target structure

The project adopts WXT's canonical flat structure in full. Every directory
below has its documented WXT role; nothing lives outside this layout.

```text
toddler-mode/
├── .output/                   # build artifacts (gitignored)
├── .wxt/                      # WXT-generated TS config (gitignored)
├── assets/                    # CSS processed by WXT
│   ├── content.css            # bubble/icon styles (was the STYLES string)
│   └── options.css            # options styles (was inline <style>)
├── components/                # auto-imported UI components (vanilla DOM builders)
│   ├── bubble.ts              # bubble: header, body, loading dots, error slot,
│   │                          #   setup prompt
│   └── icon.ts                # the 🧸 trigger button
├── entrypoints/
│   ├── background.ts          # cloud streaming; owns config + API key
│   ├── content/
│   │   ├── index.ts           # entrypoint: selection detection + orchestration
│   │   ├── session.ts         # SummarySession (co-located, not an entrypoint)
│   │   └── local-model.ts     # Gemini Nano (Prompt API) path (co-located)
│   └── options/
│       ├── index.html         # options page shell (no inline JS/CSS)
│       └── main.ts            # options logic
├── public/
│   └── icon/                  # committed 16/48/128 PNGs (WXT auto-wires them)
├── utils/                     # auto-imported; pure, unit-testable modules
│   ├── prompt.ts              # the single TODDLER_PROMPT constant
│   ├── config.ts              # storage.defineItem entries + isConfigComplete
│   ├── providers.ts           # buildRequest() per provider (pure)
│   ├── sse.ts                 # SSE line splitting + OpenAI/Anthropic parsers (pure)
│   ├── stream-delta.ts        # full-text→suffix delta math (pure)
│   ├── positioning.ts         # icon/bubble clamp + flip-above math (pure)
│   └── messaging.ts           # typed port + runtime message protocol
├── docs/superpowers/specs/    # this document and future specs
├── .env                       # env vars (gitignored; none needed yet)
├── .env.publish               # `wxt submit` store secrets (gitignored)
├── web-ext.config.ts          # dev browser startup config (start URLs etc.)
├── wxt.config.ts              # main WXT config; generates the manifest
├── package.json / tsconfig.json / vitest.config.ts
├── gen_icons.py               # icon regeneration utility (output committed)
└── README.md
```

Canonical directories deliberately not created, each documented in the README:
`composables/` (Vue-only) and `hooks/` (React/Solid-only) — N/A for vanilla TS;
`modules/` — no local WXT modules yet; `app.config.ts` — no runtime config yet.
Each appears the moment it's needed.

`.output/`, `.wxt/`, `node_modules/`, and `.env*` are gitignored.

### Refit map (existing artifact → canonical home)

| Today | Refit to |
| --- | --- |
| `manifest.json` | generated from `wxt.config.ts` |
| `content.js` — selection detection + orchestration | `entrypoints/content/index.ts` + `session.ts` |
| `content.js` — Gemini Nano path | `entrypoints/content/local-model.ts` |
| `content.js` — icon/bubble DOM building | `components/icon.ts` + `components/bubble.ts` |
| `content.js` — `STYLES` string | `assets/content.css` |
| `content.js` — positioning math | `utils/positioning.ts` |
| `content.js` — streaming delta math | `utils/stream-delta.ts` |
| `content.js` — config read (`getConfig`) | `utils/config.ts` (now used by background + options) |
| `background.js` — port handling + streaming | `entrypoints/background.ts` |
| `background.js` — request building | `utils/providers.ts` |
| `background.js` — SSE line parsers | `utils/sse.ts` |
| `TODDLER_PROMPT` (duplicated in both files) | `utils/prompt.ts` |
| `options.html` | `entrypoints/options/index.html` |
| `options.html` — inline `<style>` | `assets/options.css` |
| `options.js` | `entrypoints/options/main.ts` |
| `icons/*.png` | `public/icon/*.png` |
| `gen_icons.py` | stays at root as a dev utility |

Legacy root files (`manifest.json`, `content.js`, `background.js`,
`options.html`, `options.js`, `icons/`) are deleted at the end of the port.

### Manifest (generated via wxt.config.ts)

Unchanged surface: `permissions: ["storage"]`, `host_permissions: ["<all_urls>"]`,
content script on `<all_urls>` at `document_idle`, options page, action with
default title, icons. Name/description/version carry over.

## Architecture

### Config and the API key move into the background

Content sends `{ type: 'summarize', text }` — **no config, no key**. The
background loads config via `utils/config.ts` (typed `storage.defineItem`
entries shared with the options page), validates it, and builds the provider
request. If config is incomplete it replies `{ type: 'not-configured' }` and the
bubble shows the existing "Open settings" prompt. Result: one config path, and
the key never enters page-adjacent context.

The **Gemini Nano path stays in the content script** — the Prompt API is not
available in the MV3 service worker (as the README documents). Its behavior is
unchanged: availability check, download-progress status line, streamed session,
fall through to cloud on `unavailable`.

### Typed port protocol (`utils/messaging.ts`)

```ts
type SummarizeRequest = { type: 'summarize'; text: string };
type PortResponse =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'not-configured' }
  | { type: 'error'; message: string };
```

Both sides narrow on `type`; misspelled fields and unhandled message types fail
at compile time. The existing one-off `{ type: 'open-options' }` runtime message
(setup-prompt button → background opens the options page) is also typed here and
kept as-is.

### SummarySession (content side)

One object per bubble open, owning: the local controller/session, the cloud
port, the typewriter timer, and scroll/resize listeners. One `destroy()` tears
all of it down; `openBubble` always destroys the previous session first
(single-flight). Replaces the six mutable module-level variables in the current
`content.js`.

### Shadow DOM UI via `createShadowRootUi`

`defineContentScript({ matches: ['<all_urls>'], runAt: 'document_idle',
cssInjectionMode: 'ui' })` with `assets/content.css` imported — replaces the
hand-rolled host element and inline `STYLES` string. Icon and bubble DOM
builders are auto-imported from `components/`. Visual design ported verbatim.
`ctx.addEventListener` is used for document/window listeners so WXT can clean
them up on invalidation.

## Reliability fixes

| Fix | Behavior |
| --- | --- |
| Stall watchdog | Background aborts the fetch if no bytes arrive for 20s (per-read timer combined with port-disconnect abort). Bubble shows a friendly timeout error. |
| Scroll repositioning | While the bubble is open, scroll/resize re-measure the live selection range rect (rAF-throttled) and reposition. Icon still hides on scroll as today. If the selection is gone, keep last position. |
| Keyboard selections | `keyup` for selection-modifying keys (shift+arrows/Home/End, Ctrl/Cmd-A) runs the same selection handler as `mouseup`, positioned from the range rect. |
| Single-flight | `SummarySession.destroy()` is the only teardown path; no leaked ports/sessions/timers. |
| Error rendering | The bubble has a single error slot: a new error replaces any prior error instead of stacking; partial streamed text above it is kept. Friendly messages preserved (`Stopped.`, network-unreachable hint, truncated HTTP error bodies). |
| Token cap parity | OpenAI-compatible requests get `max_tokens: 200` to match Anthropic. |
| Storage errors | Surfaced through typed config helpers (promise-based) instead of ignored callbacks. |
| SSE robustness | CRLF-tolerant line handling; `event:`/comment lines ignored; trailing-buffer flush kept; all covered by tests. |

MV3 service-worker lifetime note: port traffic keeps the worker alive during
streams; the watchdog bounds the worst case.

## Data flow (cloud path)

select text → icon appears → click → `SummarySession.start()` → try local →
`unavailable` → `browser.runtime.connect({ name: 'summarize' })` → send
`{ type: 'summarize', text }` → background loads + validates config →
(incomplete → `not-configured` → setup prompt) → `buildRequest(provider, …)` →
streamed `fetch` → SSE lines → parser → `chunk` messages → typewriter render →
`done`. Closing the bubble disconnects the port; background aborts the fetch on
disconnect. Every failure funnels to the single error renderer.

## Testing

Unit tests (Vitest + `WxtVitest`) over `utils/`:

- **sse.ts** — OpenAI delta lines, Anthropic `content_block_delta` lines,
  `[DONE]`, empty/comment/`event:` lines, partial frames across chunk
  boundaries, CRLF endings, malformed JSON.
- **stream-delta.ts** — growing-prefix chunks, non-prefix chunks, empty deltas.
- **positioning.ts** — clamping at all four viewport edges, flip-above when no
  room below, no-rect fallback to anchor point.
- **config.ts** — completeness validation, per-provider defaults.
- **providers.ts** — exact URL/headers/body per provider, including
  `anthropic-version` and `max_tokens: 200` on both providers.

Manual smoke checklist (run via `npm run dev`): select→icon→bubble on the local
path; cloud path with a real key (both providers); options save/load;
Esc/✕/click-outside close; scroll repositioning; keyboard selection.

`package.json` scripts: `dev`, `build`, `zip`, `test` (vitest run), `check`
(`tsc --noEmit` — WXT does not typecheck during build).

## Migration order (each step leaves the extension loadable)

1. **Commit the current working tree** — the uncommitted hybrid/on-device
   feature becomes the migration baseline.
2. Scaffold the full canonical WXT structure: `package.json`, `wxt.config.ts`,
   `web-ext.config.ts`, `tsconfig.json`, `vitest.config.ts`, the
   `assets/`/`components/`/`entrypoints/`/`public/`/`utils/` directories, and
   `.gitignore` entries (`.output/`, `.wxt/`, `node_modules/`, `.env*`); move
   icons to `public/icon/`.
3. Port `utils/` pure modules **with their tests, green before any UI work**.
4. Port `entrypoints/background.ts` (config ownership moves here).
5. Port the content entrypoint (`createShadowRootUi`, `SummarySession`,
   reliability fixes).
6. Port the options page; delete legacy root files.
7. Rewrite README (dev workflow: `npm i && npm run dev`; retire the
   "no build step" promise honestly); verify with `wxt build`, `npm test`,
   `npm run check`, and the manual smoke checklist.

## Out of scope

- UI framework adoption, e2e tests, ESLint, Firefox/Safari targets, iframe
  (`all_frames`) support, changing models/prompts/visuals, Web Store publishing
  automation. All are clean follow-ups on top of this structure.
