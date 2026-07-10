# Toddler Mode WXT Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Toddler Mode extension from plain-JS MV3 files to WXT's canonical flat structure (TypeScript + Vite), moving config/API-key ownership into the background and fixing the reliability issues listed in the spec.

**Architecture:** WXT generates the manifest from `wxt.config.ts` and file-based entrypoints (`entrypoints/background.ts`, `entrypoints/content/`, `entrypoints/options/`). All fragile logic (SSE parsing, streaming delta math, positioning, config validation, provider request building) lives in pure modules under `utils/` with Vitest coverage. The content script sends only selected text over a typed port; the background loads config and streams the cloud response back. The Gemini Nano path stays in the content script.

**Tech Stack:** WXT (latest), TypeScript (strict), Vitest + `WxtVitest` plugin, happy-dom (component tests only), vanilla DOM. No UI framework, no AI SDKs (raw `fetch`).

**Spec:** `docs/superpowers/specs/2026-07-09-wxt-migration-design.md` (approved). Read it before starting.

## Global Constraints

- Package manager: **npm**. TypeScript **strict**. Vanilla DOM — no React/Vue/Svelte.
- Canonical WXT flat layout, **no `srcDir`**. `composables/`, `hooks/`, `modules/`, `app.config.ts` are intentionally not created (documented in README).
- Storage keys preserved **exactly**: `sync:provider`, `sync:endpoint`, `sync:model`, `local:apiKey` (existing users' settings must survive).
- Provider defaults preserved verbatim: openai → `https://api.openai.com/v1/chat/completions` / `gpt-4o-mini`; anthropic → `https://api.anthropic.com/v1/messages` / `claude-haiku-4-5`.
- `TODDLER_PROMPT` text verbatim, single source `utils/prompt.ts`.
- Anthropic headers verbatim: `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`.
- `max_tokens: 200` on **both** providers. Stall watchdog: **20000 ms**. Selection length: min **3**, max **8000** chars.
- Visual design ported verbatim from the legacy CSS (`STYLES` string in `content.js`, inline `<style>` in `options.html`).
- Legacy root files (`manifest.json`, `content.js`, `background.js`, `options.html`, `options.js`) stay in place until Task 13 so the legacy extension remains loadable from the repo root during migration.
- From Task 3 onward, every task must end green on: `npm test`, `npm run check`, `npm run build`.
- WXT auto-imports provide `defineBackground`, `defineContentScript`, `createShadowRootUi`, `browser`, and `storage` — they need no import statement in entrypoint code (`utils/config.ts` imports `storage` from `#imports` explicitly so tests resolve it). Our own modules are always imported explicitly via the `@/` alias.
- Every commit message ends with the trailer line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Baseline commit of the uncommitted hybrid feature

The working tree has uncommitted changes (`README.md`, `content.js`, `options.html`, `options.js`) — the on-device Gemini Nano feature. Commit them untouched so the migration has a clean baseline.

**Files:**
- Modify: none (commit only)

**Interfaces:**
- Consumes: nothing
- Produces: clean working tree at the migration baseline

- [ ] **Step 1: Verify what is uncommitted**

Run: `git status --short`
Expected: exactly `M README.md`, `M content.js`, `M options.html`, `M options.js` (plus untracked `docs/` files already committed — if other unexpected changes appear, stop and ask).

- [ ] **Step 2: Commit the baseline**

```bash
git add README.md content.js options.html options.js
git commit -m "Add on-device Gemini Nano path with cloud fallback (pre-WXT baseline)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Run: `git status --short` → empty output (docs/ plan file may be untracked until committed with this plan).

---

### Task 2: WXT scaffold — configs, deps, icons, stub background

**Files:**
- Create: `package.json`, `wxt.config.ts`, `web-ext.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `entrypoints/background.ts` (stub), `.env` (empty, untracked), `.env.publish` (empty, untracked)
- Move: `icons/icon16.png` → `public/icon/16.png`, `icons/icon48.png` → `public/icon/48.png`, `icons/icon128.png` → `public/icon/128.png`
- Modify: `gen_icons.py:49-52`

**Interfaces:**
- Consumes: nothing
- Produces: working `npm run build` / `npm test` / `npm run check` pipeline; `.output/chrome-mv3/` build; `@/` path alias; auto-imports

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "toddler-mode",
  "description": "Highlight any text and get a tiny summary explained like you're a toddler.",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "check": "wxt prepare && tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "postinstall": "wxt prepare"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `npm install -D wxt typescript vitest happy-dom`
Expected: exit 0; `package.json` gains `devDependencies` with current versions; `postinstall` runs `wxt prepare` and creates `.wxt/`.

- [ ] **Step 3: Create `wxt.config.ts`**

```ts
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
```

- [ ] **Step 4: Create `web-ext.config.ts`**

```ts
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  startUrls: ['https://en.wikipedia.org/wiki/Bear'],
});
```

- [ ] **Step 5: Create `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true
  }
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
});
```

- [ ] **Step 7: Create `.gitignore` and empty env files**

`.gitignore`:

```gitignore
node_modules/
.output/
.wxt/
.env
.env.publish
```

Run: `touch .env .env.publish`
(Both are gitignored by design — placeholders for future env vars / `wxt submit` secrets.)

- [ ] **Step 8: Move icons to `public/icon/`**

```bash
mkdir -p public/icon
git mv icons/icon16.png public/icon/16.png
git mv icons/icon48.png public/icon/48.png
git mv icons/icon128.png public/icon/128.png
```

- [ ] **Step 9: Update `gen_icons.py` to write to the new location**

In `gen_icons.py`, replace the `main()` function:

```python
def main():
    here = os.path.dirname(os.path.abspath(__file__))
    icons = os.path.join(here, "public", "icon")
    os.makedirs(icons, exist_ok=True)
    for s in (16, 48, 128):
        make_png(os.path.join(icons, f"{s}.png"), s)
```

- [ ] **Step 10: Create stub `entrypoints/background.ts`** (so the build has an entrypoint; replaced in Task 8)

```ts
export default defineBackground(() => {
  // Stub — replaced by the real implementation in the background task.
});
```

- [ ] **Step 11: Verify the pipeline is green**

Run: `npm test` → "No test files found" but exit 0 (passWithNoTests).
Run: `npm run check` → exit 0.
Run: `npm run build` → exit 0; then `cat .output/chrome-mv3/manifest.json` — must contain `"name":"Toddler Mode"`, `"permissions":["storage"]`, `"host_permissions":["<all_urls>"]`, `"icons"` with 16/48/128, and a `"background"` service worker. The legacy root `manifest.json` is untouched.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json wxt.config.ts web-ext.config.ts tsconfig.json vitest.config.ts .gitignore entrypoints/background.ts gen_icons.py public/
git commit -m "Scaffold WXT project structure (configs, deps, icons, stub background)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `utils/prompt.ts`, `utils/messaging.ts`, `utils/config.ts`

**Files:**
- Create: `utils/prompt.ts`, `utils/messaging.ts`, `utils/config.ts`
- Test: `utils/config.test.ts`

**Interfaces:**
- Consumes: `storage` from `#imports`
- Produces:
  - `TODDLER_PROMPT: string`
  - `SUMMARIZE_PORT = 'summarize'`; types `SummarizeRequest`, `PortResponse`, `OpenOptionsMessage`
  - `type Provider = 'openai' | 'anthropic' | 'custom'`; `interface CloudConfig { provider: Provider; endpoint: string; model: string; apiKey: string }`
  - `PROVIDER_DEFAULTS: Record<Provider, { endpoint: string; model: string }>`
  - storage items `providerItem`, `endpointItem`, `modelItem`, `apiKeyItem`
  - `loadCloudConfig(): Promise<CloudConfig>`; `isConfigComplete(c: CloudConfig): boolean`

- [ ] **Step 1: Write the failing test `utils/config.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  PROVIDER_DEFAULTS,
  isConfigComplete,
  loadCloudConfig,
  providerItem,
} from '@/utils/config';

describe('config', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('exposes verbatim provider defaults', () => {
    expect(PROVIDER_DEFAULTS.openai).toEqual({
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
    });
    expect(PROVIDER_DEFAULTS.anthropic).toEqual({
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-haiku-4-5',
    });
    expect(PROVIDER_DEFAULTS.custom).toEqual({ endpoint: '', model: '' });
  });

  it('loads fallback values when nothing is stored', async () => {
    const config = await loadCloudConfig();
    expect(config).toEqual({ provider: 'openai', endpoint: '', model: '', apiKey: '' });
  });

  it('round-trips values and keeps the legacy raw storage keys', async () => {
    await providerItem.setValue('anthropic');
    const config = await loadCloudConfig();
    expect(config.provider).toBe('anthropic');
    // Legacy-compat guarantee: same raw key in chrome.storage.sync as the old JS used.
    const raw = await fakeBrowser.storage.sync.get('provider');
    expect(raw.provider).toBe('anthropic');
  });

  it('validates completeness', () => {
    const complete = {
      provider: 'openai' as const,
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
    };
    expect(isConfigComplete(complete)).toBe(true);
    expect(isConfigComplete({ ...complete, apiKey: '' })).toBe(false);
    expect(isConfigComplete({ ...complete, endpoint: '' })).toBe(false);
    expect(isConfigComplete({ ...complete, model: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/config.test.ts`
Expected: FAIL — cannot resolve `@/utils/config`.

- [ ] **Step 3: Create `utils/prompt.ts`** (text verbatim from the legacy files)

```ts
// The heart of it: the toddler voice. Tweak this string to change the vibe.
// Single source of truth — used by the on-device path (content) and the
// cloud path (background).
export const TODDLER_PROMPT =
  'You explain things to a 3-year-old. Read the text and say what it means ' +
  'using only short, simple words a small kid knows. Keep it to 2 or 3 short ' +
  'sentences. Be warm, fun, and a little silly. Never use big or fancy words. ' +
  'Do not mention that you are an AI.';
```

- [ ] **Step 4: Create `utils/messaging.ts`**

```ts
// Typed protocol for all content <-> background messaging.

export const SUMMARIZE_PORT = 'summarize';

// Content -> background, over the summarize port. Text only — never config or keys.
export interface SummarizeRequest {
  type: 'summarize';
  text: string;
}

// Background -> content, over the summarize port.
export type PortResponse =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'not-configured' }
  | { type: 'error'; message: string };

// One-off runtime message: content scripts can't call openOptionsPage themselves.
export interface OpenOptionsMessage {
  type: 'open-options';
}
```

- [ ] **Step 5: Create `utils/config.ts`**

```ts
import { storage } from '#imports';

export type Provider = 'openai' | 'anthropic' | 'custom';

export interface CloudConfig {
  provider: Provider;
  endpoint: string;
  model: string;
  apiKey: string;
}

// Sensible per-provider defaults for the endpoint + model fields.
export const PROVIDER_DEFAULTS: Record<Provider, { endpoint: string; model: string }> = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5',
  },
  custom: { endpoint: '', model: '' },
};

// Keys match the legacy chrome.storage usage exactly, so existing users'
// settings survive the migration. Provider/endpoint/model sync; the key
// stays local only.
export const providerItem = storage.defineItem<Provider>('sync:provider', { fallback: 'openai' });
export const endpointItem = storage.defineItem<string>('sync:endpoint', { fallback: '' });
export const modelItem = storage.defineItem<string>('sync:model', { fallback: '' });
export const apiKeyItem = storage.defineItem<string>('local:apiKey', { fallback: '' });

export async function loadCloudConfig(): Promise<CloudConfig> {
  const [provider, endpoint, model, apiKey] = await Promise.all([
    providerItem.getValue(),
    endpointItem.getValue(),
    modelItem.getValue(),
    apiKeyItem.getValue(),
  ]);
  return { provider, endpoint, model, apiKey };
}

export function isConfigComplete(c: CloudConfig): boolean {
  return Boolean(c.provider && c.endpoint && c.model && c.apiKey);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run utils/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Full pipeline + commit**

Run: `npm test && npm run check && npm run build` → all exit 0.

```bash
git add utils/prompt.ts utils/messaging.ts utils/config.ts utils/config.test.ts
git commit -m "Add shared prompt constant, typed messaging protocol, and config store" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `utils/sse.ts` — SSE line splitting and per-provider parsers

**Files:**
- Create: `utils/sse.ts`
- Test: `utils/sse.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type SseLineParser = (line: string) => string | null`
  - `createSseLineSplitter(onLine: (line: string) => void): { push(chunkText: string): void; flush(): void }`
  - `parseOpenAILine: SseLineParser`, `parseAnthropicLine: SseLineParser`

- [ ] **Step 1: Write the failing test `utils/sse.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createSseLineSplitter, parseAnthropicLine, parseOpenAILine } from '@/utils/sse';

describe('createSseLineSplitter', () => {
  it('emits complete lines and buffers the trailing partial', () => {
    const lines: string[] = [];
    const splitter = createSseLineSplitter((l) => lines.push(l));
    splitter.push('data: a\ndata: b\ndata: par');
    expect(lines).toEqual(['data: a', 'data: b']);
    splitter.push('tial\n');
    expect(lines).toEqual(['data: a', 'data: b', 'data: partial']);
  });

  it('strips CRLF endings', () => {
    const lines: string[] = [];
    const splitter = createSseLineSplitter((l) => lines.push(l));
    splitter.push('data: x\r\ndata: y\r\n');
    expect(lines).toEqual(['data: x', 'data: y']);
  });

  it('flush emits the remaining buffer once', () => {
    const lines: string[] = [];
    const splitter = createSseLineSplitter((l) => lines.push(l));
    splitter.push('data: tail');
    splitter.flush();
    splitter.flush();
    expect(lines).toEqual(['data: tail']);
  });
});

describe('parseOpenAILine', () => {
  it('extracts delta content', () => {
    const line = 'data: {"choices":[{"delta":{"content":"hi"}}]}';
    expect(parseOpenAILine(line)).toBe('hi');
  });

  it('returns null for [DONE], non-data lines, and malformed JSON', () => {
    expect(parseOpenAILine('data: [DONE]')).toBeNull();
    expect(parseOpenAILine('event: message')).toBeNull();
    expect(parseOpenAILine('')).toBeNull();
    expect(parseOpenAILine('data: {not json')).toBeNull();
    expect(parseOpenAILine('data: {"choices":[{"delta":{}}]}')).toBeNull();
  });
});

describe('parseAnthropicLine', () => {
  it('extracts text_delta content', () => {
    const line =
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"yo"}}';
    expect(parseAnthropicLine(line)).toBe('yo');
  });

  it('returns null for other event types, non-data lines, and malformed JSON', () => {
    expect(parseAnthropicLine('data: {"type":"message_start"}')).toBeNull();
    expect(parseAnthropicLine('event: content_block_delta')).toBeNull();
    expect(parseAnthropicLine('data: {broken')).toBeNull();
    expect(parseAnthropicLine('data:')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/sse.test.ts`
Expected: FAIL — cannot resolve `@/utils/sse`.

- [ ] **Step 3: Create `utils/sse.ts`**

```ts
// Streaming SSE helpers shared by the background cloud path.
// Pure functions — no browser APIs — so they stay unit-testable.

export type SseLineParser = (line: string) => string | null;

// SSE frames are newline-delimited; keep the trailing partial line buffered
// until the next chunk (or flush) completes it. Tolerates CRLF endings.
export function createSseLineSplitter(onLine: (line: string) => void) {
  let buffer = '';

  function stripCr(line: string): string {
    return line.endsWith('\r') ? line.slice(0, -1) : line;
  }

  return {
    push(chunkText: string): void {
      buffer += chunkText;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) onLine(stripCr(line));
    },
    flush(): void {
      if (buffer) onLine(stripCr(buffer));
      buffer = '';
    },
  };
}

// OpenAI: `data: {"choices":[{"delta":{"content":"..."}}]}` / `data: [DONE]`.
export const parseOpenAILine: SseLineParser = (line) => {
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (!data || data === '[DONE]') return null;
  try {
    const json = JSON.parse(data);
    return json?.choices?.[0]?.delta?.content || null;
  } catch {
    return null;
  }
};

// Anthropic: `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`.
export const parseAnthropicLine: SseLineParser = (line) => {
  if (!line.startsWith('data:')) return null;
  const data = line.slice(5).trim();
  if (!data) return null;
  try {
    const json = JSON.parse(data);
    if (json?.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return json.delta.text || null;
    }
    return null;
  } catch {
    return null;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/sse.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full pipeline + commit**

Run: `npm test && npm run check && npm run build` → all exit 0.

```bash
git add utils/sse.ts utils/sse.test.ts
git commit -m "Add pure SSE line splitter and per-provider parsers with tests" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `utils/stream-delta.ts` — Prompt API delta math

**Files:**
- Create: `utils/stream-delta.ts`
- Test: `utils/stream-delta.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `createDeltaExtractor(): (chunk: unknown) => string`

- [ ] **Step 1: Write the failing test `utils/stream-delta.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createDeltaExtractor } from '@/utils/stream-delta';

describe('createDeltaExtractor', () => {
  it('emits only the newly added suffix for growing full-text chunks', () => {
    const extract = createDeltaExtractor();
    expect(extract('Hel')).toBe('Hel');
    expect(extract('Hello')).toBe('lo');
    expect(extract('Hello world')).toBe(' world');
  });

  it('returns an empty delta when the chunk repeats', () => {
    const extract = createDeltaExtractor();
    extract('abc');
    expect(extract('abc')).toBe('');
  });

  it('treats a non-prefix chunk as a raw delta (already-incremental streams)', () => {
    const extract = createDeltaExtractor();
    expect(extract('Hello ')).toBe('Hello ');
    expect(extract('world')).toBe('world');
    expect(extract('Hello world!')).toBe('!');
  });

  it('stringifies non-string chunks', () => {
    const extract = createDeltaExtractor();
    expect(extract(123)).toBe('123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/stream-delta.test.ts`
Expected: FAIL — cannot resolve `@/utils/stream-delta`.

- [ ] **Step 3: Create `utils/stream-delta.ts`**

```ts
// Chrome's Prompt API promptStreaming yields the FULL text so far on each
// chunk — emit only the newly added suffix so text isn't repeated. If a chunk
// is not a prefix-extension (some implementations stream raw deltas), treat
// it as a delta and append it to the running text.
export function createDeltaExtractor(): (chunk: unknown) => string {
  let prev = '';
  return (chunk: unknown): string => {
    const text = String(chunk);
    let delta: string;
    if (text.startsWith(prev)) {
      delta = text.slice(prev.length);
      prev = text;
    } else {
      delta = text;
      prev += delta;
    }
    return delta;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/stream-delta.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full pipeline + commit**

Run: `npm test && npm run check && npm run build` → all exit 0.

```bash
git add utils/stream-delta.ts utils/stream-delta.test.ts
git commit -m "Add streaming delta extractor for the Prompt API path with tests" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `utils/positioning.ts` — icon/bubble placement math

**Files:**
- Create: `utils/positioning.ts`
- Test: `utils/positioning.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `ICON_SIZE = 30`, `BUBBLE_WIDTH = 300`
  - `interface Point { x: number; y: number }`
  - `interface RectLike { left: number; top: number; right: number; bottom: number }` (DOMRect satisfies it)
  - `interface Viewport { width: number; height: number }`
  - `clampIconPosition(x: number, y: number, vp: Viewport): Point`
  - `bubblePosition(rect: RectLike | null, anchor: Point, bubbleHeight: number, vp: Viewport): Point`

- [ ] **Step 1: Write the failing test `utils/positioning.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  BUBBLE_WIDTH,
  ICON_SIZE,
  bubblePosition,
  clampIconPosition,
} from '@/utils/positioning';

const vp = { width: 1000, height: 800 };

describe('clampIconPosition', () => {
  it('passes through positions well inside the viewport', () => {
    expect(clampIconPosition(200, 300, vp)).toEqual({ x: 200, y: 300 });
  });

  it('clamps to all four edges with an 8px margin', () => {
    expect(clampIconPosition(-50, -50, vp)).toEqual({ x: 8, y: 8 });
    expect(clampIconPosition(5000, 5000, vp)).toEqual({
      x: vp.width - ICON_SIZE - 8,
      y: vp.height - ICON_SIZE - 8,
    });
  });
});

describe('bubblePosition', () => {
  const rect = { left: 100, top: 200, right: 400, bottom: 220 };

  it('places the bubble below the selection by default', () => {
    expect(bubblePosition(rect, { x: 0, y: 0 }, 120, vp)).toEqual({ x: 100, y: 228 });
  });

  it('flips above the selection when there is no room below', () => {
    const lowRect = { left: 100, top: 700, right: 400, bottom: 780 };
    // top would be 788; 788 + 120 > 790, so flip: 700 - 120 - 8 = 572
    expect(bubblePosition(lowRect, { x: 0, y: 0 }, 120, vp).y).toBe(572);
  });

  it('clamps horizontally so the bubble stays in the viewport', () => {
    const rightRect = { left: 950, top: 200, right: 990, bottom: 220 };
    expect(bubblePosition(rightRect, { x: 0, y: 0 }, 120, vp).x).toBe(
      vp.width - BUBBLE_WIDTH - 10,
    );
  });

  it('falls back to the anchor point when there is no rect', () => {
    expect(bubblePosition(null, { x: 300, y: 400 }, 120, vp)).toEqual({ x: 300, y: 400 });
  });

  it('uses a 120px height estimate when measured height is 0', () => {
    const lowRect = { left: 100, top: 700, right: 400, bottom: 780 };
    expect(bubblePosition(lowRect, { x: 0, y: 0 }, 0, vp).y).toBe(572);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/positioning.test.ts`
Expected: FAIL — cannot resolve `@/utils/positioning`.

- [ ] **Step 3: Create `utils/positioning.ts`**

```ts
// Pure placement math for the floating icon and bubble. Viewport-relative
// coordinates in, viewport-relative coordinates out — no DOM access.

export const ICON_SIZE = 30; // must match .tm-icon width/height in assets/content.css
export const BUBBLE_WIDTH = 300; // must match .tm-bubble width in assets/content.css

const BUBBLE_MARGIN = 10;
const ICON_MARGIN = 8;
const GAP = 8; // gap between the selection rect and the bubble
const FALLBACK_BUBBLE_HEIGHT = 120;

export interface Point {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function clampIconPosition(x: number, y: number, vp: Viewport): Point {
  return {
    x: Math.min(Math.max(x, ICON_MARGIN), vp.width - ICON_SIZE - ICON_MARGIN),
    y: Math.min(Math.max(y, ICON_MARGIN), vp.height - ICON_SIZE - ICON_MARGIN),
  };
}

export function bubblePosition(
  rect: RectLike | null,
  anchor: Point,
  bubbleHeight: number,
  vp: Viewport,
): Point {
  const h = bubbleHeight || FALLBACK_BUBBLE_HEIGHT;

  let left = rect ? rect.left : anchor.x;
  let top = rect ? rect.bottom + GAP : anchor.y;

  // Flip above the selection if there isn't room below.
  if (rect && top + h > vp.height - BUBBLE_MARGIN) {
    top = Math.max(BUBBLE_MARGIN, rect.top - h - GAP);
  }
  left = Math.min(Math.max(BUBBLE_MARGIN, left), vp.width - BUBBLE_WIDTH - BUBBLE_MARGIN);
  top = Math.min(Math.max(BUBBLE_MARGIN, top), vp.height - h - BUBBLE_MARGIN);

  return { x: left, y: top };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/positioning.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full pipeline + commit**

Run: `npm test && npm run check && npm run build` → all exit 0.

```bash
git add utils/positioning.ts utils/positioning.test.ts
git commit -m "Add pure positioning math for icon and bubble with tests" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `utils/providers.ts` — cloud request building

**Files:**
- Create: `utils/providers.ts`
- Test: `utils/providers.test.ts`

**Interfaces:**
- Consumes: `TODDLER_PROMPT` (`@/utils/prompt`), `CloudConfig` (`@/utils/config`), `SseLineParser`, `parseOpenAILine`, `parseAnthropicLine` (`@/utils/sse`)
- Produces:
  - `interface ProviderRequest { url: string; headers: Record<string, string>; body: unknown; parseLine: SseLineParser }`
  - `buildRequest(text: string, config: CloudConfig): ProviderRequest`

- [ ] **Step 1: Write the failing test `utils/providers.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { TODDLER_PROMPT } from '@/utils/prompt';
import { buildRequest } from '@/utils/providers';
import { parseAnthropicLine, parseOpenAILine } from '@/utils/sse';

const base = { endpoint: '', model: '', apiKey: 'sk-test' };

describe('buildRequest', () => {
  it('builds an Anthropic request with verbatim headers and max_tokens 200', () => {
    const req = buildRequest('some text', {
      ...base,
      provider: 'anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-haiku-4-5',
    });
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(req.body).toEqual({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      stream: true,
      system: TODDLER_PROMPT,
      messages: [{ role: 'user', content: 'some text' }],
    });
    expect(req.parseLine).toBe(parseAnthropicLine);
  });

  it('builds an OpenAI-compatible request with max_tokens 200', () => {
    const req = buildRequest('some text', {
      ...base,
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
    });
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-test',
    });
    expect(req.body).toEqual({
      model: 'gpt-4o-mini',
      stream: true,
      max_tokens: 200,
      messages: [
        { role: 'system', content: TODDLER_PROMPT },
        { role: 'user', content: 'some text' },
      ],
    });
    expect(req.parseLine).toBe(parseOpenAILine);
  });

  it('treats custom provider as OpenAI-compatible and falls back to default URLs', () => {
    const custom = buildRequest('t', { ...base, provider: 'custom', model: 'local-llm' });
    expect(custom.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(custom.parseLine).toBe(parseOpenAILine);

    const anthropic = buildRequest('t', { ...base, provider: 'anthropic', model: 'm' });
    expect(anthropic.url).toBe('https://api.anthropic.com/v1/messages');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/providers.test.ts`
Expected: FAIL — cannot resolve `@/utils/providers`.

- [ ] **Step 3: Create `utils/providers.ts`**

```ts
import type { CloudConfig } from '@/utils/config';
import { TODDLER_PROMPT } from '@/utils/prompt';
import { parseAnthropicLine, parseOpenAILine, type SseLineParser } from '@/utils/sse';

const ANTHROPIC_VERSION = '2023-06-01';
// Summaries are 2-3 short sentences; the cap bounds cost if a provider misbehaves.
const MAX_TOKENS = 200;

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  parseLine: SseLineParser;
}

// Build the provider-specific request and the matching SSE line parser.
export function buildRequest(text: string, config: CloudConfig): ProviderRequest {
  if (config.provider === 'anthropic') {
    return {
      url: config.endpoint || 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: config.model,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: TODDLER_PROMPT,
        messages: [{ role: 'user', content: text }],
      },
      parseLine: parseAnthropicLine,
    };
  }

  // OpenAI-compatible (also used for "custom" endpoints).
  return {
    url: config.endpoint || 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: {
      model: config.model,
      stream: true,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: TODDLER_PROMPT },
        { role: 'user', content: text },
      ],
    },
    parseLine: parseOpenAILine,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/providers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full pipeline + commit**

Run: `npm test && npm run check && npm run build` → all exit 0.

```bash
git add utils/providers.ts utils/providers.test.ts
git commit -m "Add provider request builder with exact-shape tests" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Real `entrypoints/background.ts` — config ownership + stall watchdog

**Files:**
- Modify: `entrypoints/background.ts` (replace the Task 2 stub entirely)

**Interfaces:**
- Consumes: `buildRequest` (`@/utils/providers`), `createSseLineSplitter` (`@/utils/sse`), `loadCloudConfig`, `isConfigComplete` (`@/utils/config`), `SUMMARIZE_PORT`, `PortResponse`, `SummarizeRequest` (`@/utils/messaging`)
- Produces: the `summarize` port protocol (consumed by Task 11's `SummarySession`) and the `open-options` message handler

- [ ] **Step 1: Replace `entrypoints/background.ts` with the real implementation**

```ts
import { isConfigComplete, loadCloudConfig } from '@/utils/config';
import { SUMMARIZE_PORT, type PortResponse, type SummarizeRequest } from '@/utils/messaging';
import { buildRequest } from '@/utils/providers';
import { createSseLineSplitter } from '@/utils/sse';

// Abort the fetch if no bytes arrive for this long — a stalled stream would
// otherwise leave the bubble's loading dots bouncing forever.
const STALL_TIMEOUT_MS = 20_000;

type Port = ReturnType<typeof browser.runtime.connect>;

export default defineBackground(() => {
  // Open the options page when the content script asks (content scripts
  // can't call openOptionsPage themselves).
  browser.runtime.onMessage.addListener((msg: unknown) => {
    if ((msg as { type?: string })?.type === 'open-options') {
      browser.runtime.openOptionsPage();
    }
  });

  // Streaming summaries flow over a long-lived port so tokens can be pushed
  // incrementally back to the content script.
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== SUMMARIZE_PORT) return;

    const controller = new AbortController();
    let active = true;

    port.onDisconnect.addListener(() => {
      active = false;
      controller.abort(); // abort the in-flight fetch when the bubble closes
    });

    port.onMessage.addListener((msg: SummarizeRequest) => {
      if (msg?.type !== 'summarize') return;
      runSummarize(msg.text, port, controller).catch((err) => {
        if (active) post(port, { type: 'error', message: errToMessage(err) });
      });
    });
  });
});

function post(port: Port, message: PortResponse): void {
  try {
    port.postMessage(message);
  } catch {
    // Port already closed — ignore.
  }
}

async function runSummarize(
  text: string,
  port: Port,
  controller: AbortController,
): Promise<void> {
  // Config (including the API key) is loaded HERE — it never transits the
  // content script or the port.
  const config = await loadCloudConfig();
  if (!isConfigComplete(config)) {
    post(port, { type: 'not-configured' });
    return;
  }

  const request = buildRequest(text, config);

  let stalled = false;
  const onStall = () => {
    stalled = true;
    controller.abort();
  };
  let stallTimer: ReturnType<typeof setTimeout> = setTimeout(onStall, STALL_TIMEOUT_MS);
  const poke = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(onStall, STALL_TIMEOUT_MS);
  };

  try {
    const res = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await safeReadText(res);
      throw new Error(`API ${res.status} — ${truncate(errText, 300) || 'request failed'}`);
    }
    if (!res.body) throw new Error('No response stream from the API.');

    const splitter = createSseLineSplitter((line) => {
      const token = request.parseLine(line);
      if (token) post(port, { type: 'chunk', text: token });
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      poke();
      splitter.push(decoder.decode(value, { stream: true }));
    }
    splitter.push(decoder.decode());
    splitter.flush();

    post(port, { type: 'done' });
  } catch (err) {
    if (stalled) throw new Error('The API stopped responding. Try again.');
    throw err;
  } finally {
    clearTimeout(stallTimer);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function errToMessage(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  if (e?.name === 'AbortError') return 'Stopped.';
  if (e?.message && /Failed to fetch/i.test(e.message)) {
    return 'Could not reach the API. Check the endpoint URL and your connection.';
  }
  return e?.message || 'Something went wrong.';
}
```

- [ ] **Step 2: Full pipeline**

Run: `npm test && npm run check && npm run build` → all exit 0. The build output must still list the background entrypoint.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/background.ts
git commit -m "Implement background cloud streaming with config ownership and stall watchdog" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: `assets/content.css` + `components/icon.ts` + `components/bubble.ts`

**Files:**
- Create: `assets/content.css`, `components/icon.ts`, `components/bubble.ts`
- Test: `components/bubble.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `createIcon(onActivate: () => void): HTMLButtonElement`
  - `interface Bubble { root: HTMLDivElement; setStatus(text: string): void; hideLoading(): void; appendText(delta: string): void; setText(text: string): void; getText(): string; showError(message: string): void; showSetupPrompt(onOpenSettings: () => void): void }`
  - `createBubble(onClose: () => void): Bubble`

- [ ] **Step 1: Create `assets/content.css`** (ported verbatim from the legacy `STYLES` string; `${ICON_SIZE}` → `30px`; z-index moved onto the fixed elements)

```css
:host {
  all: initial;
}

.tm-icon {
  position: fixed;
  z-index: 2147483647;
  width: 30px;
  height: 30px;
  display: none;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 50%;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  padding: 0;
  margin: 0;
  pointer-events: auto;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  transition: transform 0.08s ease;
}
.tm-icon:hover {
  transform: scale(1.1);
}

.tm-bubble {
  position: fixed;
  z-index: 2147483647;
  width: 300px;
  max-width: calc(100vw - 20px);
  background: #ffffff;
  color: #1b1b1b;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.22);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  pointer-events: auto;
  overflow: hidden;
}

.tm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: linear-gradient(135deg, #ffd56b, #ff9a6b);
  color: #4a2c00;
  font-weight: 700;
  font-size: 13px;
}
.tm-title {
  user-select: none;
}
.tm-close {
  background: rgba(255, 255, 255, 0.4);
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  color: #4a2c00;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.tm-close:hover {
  background: rgba(255, 255, 255, 0.75);
}

.tm-body {
  padding: 14px;
}
.tm-status {
  font-size: 13px;
  color: #777;
  margin-bottom: 6px;
}
.tm-status:empty {
  margin: 0;
}
.tm-text {
  font-size: 16px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.tm-error {
  margin-top: 8px;
  color: #b00020;
  font-size: 14px;
}

.tm-setup-btn {
  margin-top: 10px;
  background: #ff9a6b;
  color: #ffffff;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.tm-setup-btn:hover {
  background: #ff8654;
}

.tm-loading {
  display: flex;
  gap: 5px;
  padding: 4px 0;
}
.tm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff9a6b;
  animation: tm-blink 1s infinite ease-in-out;
}
.tm-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.tm-dot:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes tm-blink {
  0%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  50% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
```

- [ ] **Step 2: Write the failing test `components/bubble.test.ts`**

```ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createBubble } from '@/components/bubble';
import { createIcon } from '@/components/icon';

describe('createIcon', () => {
  it('creates a 🧸 button that fires onActivate on click', () => {
    const onActivate = vi.fn();
    const icon = createIcon(onActivate);
    expect(icon.textContent).toBe('🧸');
    icon.click();
    expect(onActivate).toHaveBeenCalledOnce();
  });
});

describe('createBubble', () => {
  it('streams text via appendText and reads it back with getText', () => {
    const bubble = createBubble(() => {});
    bubble.appendText('Hello ');
    bubble.appendText('bear');
    expect(bubble.getText()).toBe('Hello bear');
  });

  it('has a single error slot — a second error replaces the first', () => {
    const bubble = createBubble(() => {});
    bubble.appendText('partial text');
    bubble.showError('first');
    bubble.showError('second');
    const errors = bubble.root.querySelectorAll('.tm-error');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.textContent).toBe('Uh oh! second');
    expect(bubble.getText()).toBe('partial text'); // streamed text is kept
  });

  it('hides the loading dots when showError fires', () => {
    const bubble = createBubble(() => {});
    bubble.showError('boom');
    const loading = bubble.root.querySelector('.tm-loading') as HTMLElement;
    expect(loading.style.display).toBe('none');
  });

  it('fires onClose from the ✕ button', () => {
    const onClose = vi.fn();
    const bubble = createBubble(onClose);
    (bubble.root.querySelector('.tm-close') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('renders the setup prompt with a settings button', () => {
    const onOpen = vi.fn();
    const bubble = createBubble(() => {});
    bubble.showSetupPrompt(onOpen);
    const btn = bubble.root.querySelector('.tm-setup-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run components/bubble.test.ts`
Expected: FAIL — cannot resolve `@/components/bubble`.

- [ ] **Step 4: Create `components/icon.ts`**

```ts
// The 🧸 trigger button. Position/visibility are managed by the content
// entrypoint; this only builds the element.
export function createIcon(onActivate: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tm-icon';
  btn.title = "Explain like I'm a toddler";
  btn.textContent = '🧸';
  // Keep the page selection alive when the icon is pressed.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onActivate();
  });
  return btn;
}
```

- [ ] **Step 5: Create `components/bubble.ts`**

```ts
export interface Bubble {
  root: HTMLDivElement;
  setStatus(text: string): void;
  hideLoading(): void;
  appendText(delta: string): void;
  setText(text: string): void;
  getText(): string;
  showError(message: string): void;
  showSetupPrompt(onOpenSettings: () => void): void;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function createBubble(onClose: () => void): Bubble {
  const root = el('div', 'tm-bubble') as HTMLDivElement;

  const header = el('div', 'tm-header');
  header.appendChild(el('span', 'tm-title', '🧸 Toddler Mode'));
  const closeBtn = el('button', 'tm-close', '✕') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', onClose);
  header.appendChild(closeBtn);

  const body = el('div', 'tm-body');
  const loading = el('div', 'tm-loading');
  loading.appendChild(el('span', 'tm-dot'));
  loading.appendChild(el('span', 'tm-dot'));
  loading.appendChild(el('span', 'tm-dot'));
  const status = el('div', 'tm-status');
  const textEl = el('div', 'tm-text');
  body.appendChild(loading);
  body.appendChild(status);
  body.appendChild(textEl);

  root.appendChild(header);
  root.appendChild(body);

  // Single error slot: created on first error, its content replaced on
  // later errors — errors never stack.
  let errorEl: HTMLElement | null = null;

  return {
    root,
    setStatus(text) {
      status.textContent = text;
    },
    hideLoading() {
      loading.style.display = 'none';
    },
    appendText(delta) {
      textEl.textContent += delta;
    },
    setText(text) {
      textEl.textContent = text;
    },
    getText() {
      return textEl.textContent ?? '';
    },
    showError(message) {
      loading.style.display = 'none';
      if (!errorEl) {
        errorEl = el('div', 'tm-error');
        body.appendChild(errorEl);
      }
      errorEl.textContent = `Uh oh! ${message || 'Something broke.'}`;
    },
    showSetupPrompt(onOpenSettings) {
      loading.style.display = 'none';
      status.textContent = '';
      body.appendChild(
        el(
          'div',
          'tm-text',
          "I can't find on-device AI here, and there's no cloud key yet. Let's set one up!",
        ),
      );
      const btn = el('button', 'tm-setup-btn', 'Open settings') as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', onOpenSettings);
      body.appendChild(btn);
    },
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run components/bubble.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Full pipeline + commit**

Run: `npm test && npm run check && npm run build` → all exit 0.

```bash
git add assets/content.css components/icon.ts components/bubble.ts components/bubble.test.ts
git commit -m "Add content CSS and icon/bubble components with single error slot" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Prompt API types + `entrypoints/content/local-model.ts`

**Files:**
- Create: `utils/prompt-api.d.ts`, `entrypoints/content/local-model.ts`

**Interfaces:**
- Consumes: `TODDLER_PROMPT` (`@/utils/prompt`), `createDeltaExtractor` (`@/utils/stream-delta`)
- Produces:
  - Ambient types: `LanguageModel`, `LanguageModelSession`, `LanguageModelAvailability`
  - `type LocalResult = 'ok' | 'aborted' | 'unavailable'`
  - `interface LocalCallbacks { onStatus(text: string): void; onReady(): void; onDelta(text: string): void; isAlive(): boolean }`
  - `runLocalSummary(text: string, signal: AbortSignal, cb: LocalCallbacks): Promise<LocalResult>`

- [ ] **Step 1: Create `utils/prompt-api.d.ts`** (ambient declarations for Chrome's built-in Prompt API — no `@types` package assumed)

```ts
// Minimal ambient types for Chrome's built-in Prompt API (Gemini Nano).
// Only the surface this extension uses.

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (e: { loaded: number; total?: number }) => void,
  ): void;
}

interface LanguageModelSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
}

declare class LanguageModel {
  static availability(): Promise<LanguageModelAvailability>;
  static create(options?: {
    initialPrompts?: { role: string; content: string }[];
    monitor?(m: LanguageModelMonitor): void;
    signal?: AbortSignal;
  }): Promise<LanguageModelSession>;
}
```

- [ ] **Step 2: Create `entrypoints/content/local-model.ts`** (ported from legacy `tryLocalSummary`, decoupled from the DOM via callbacks)

```ts
import { TODDLER_PROMPT } from '@/utils/prompt';
import { createDeltaExtractor } from '@/utils/stream-delta';

export type LocalResult = 'ok' | 'aborted' | 'unavailable';

export interface LocalCallbacks {
  onStatus(text: string): void;
  onReady(): void;
  onDelta(text: string): void;
  isAlive(): boolean;
}

// Try the on-device Gemini Nano path — private, no key, no network.
// Runs in the content script: the Prompt API is not available in the
// MV3 service worker.
export async function runLocalSummary(
  text: string,
  signal: AbortSignal,
  cb: LocalCallbacks,
): Promise<LocalResult> {
  if (typeof LanguageModel === 'undefined') return 'unavailable';

  let availability: LanguageModelAvailability;
  try {
    availability = await LanguageModel.availability();
  } catch {
    return 'unavailable';
  }
  if (!availability || availability === 'unavailable') return 'unavailable';

  let session: LanguageModelSession | null = null;
  try {
    if (availability !== 'available') cb.onStatus('Getting my brain ready…');

    session = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: TODDLER_PROMPT }],
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          if (!cb.isAlive()) return;
          const frac = e && e.total ? e.loaded / e.total : e ? e.loaded : 0;
          cb.onStatus(`Getting my brain ready… ${Math.round((frac || 0) * 100)}%`);
        });
      },
      signal,
    });

    if (!cb.isAlive()) return 'aborted';
    cb.onReady();

    const extractDelta = createDeltaExtractor();
    const stream = session.promptStreaming(text, { signal });
    for await (const chunk of stream) {
      if (!cb.isAlive()) break;
      const delta = extractDelta(chunk);
      if (delta) cb.onDelta(delta);
    }
    return 'ok';
  } catch (err) {
    if ((err as { name?: string } | null)?.name === 'AbortError') return 'aborted';
    // On-device failed unexpectedly — let the caller try the cloud.
    return 'unavailable';
  } finally {
    try {
      session?.destroy();
    } catch {
      // ignore
    }
  }
}
```

- [ ] **Step 3: Full pipeline**

Run: `npm test && npm run check && npm run build` → all exit 0. (`local-model.ts` is co-located inside the `content/` directory entrypoint and is not itself an entrypoint — the build output must NOT list a `local-model` entrypoint.)

- [ ] **Step 4: Commit**

```bash
git add utils/prompt-api.d.ts entrypoints/content/local-model.ts
git commit -m "Add Prompt API ambient types and DOM-decoupled local model runner" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: `entrypoints/content/session.ts` + `entrypoints/content/index.ts`

**Files:**
- Create: `entrypoints/content/session.ts`, `entrypoints/content/index.ts`

**Interfaces:**
- Consumes: `createBubble`/`Bubble` (`@/components/bubble`), `createIcon` (`@/components/icon`), `bubblePosition`, `clampIconPosition`, `Point`, `RectLike` (`@/utils/positioning`), `runLocalSummary` (`./local-model`), `SUMMARIZE_PORT`, `PortResponse`, `SummarizeRequest`, `OpenOptionsMessage` (`@/utils/messaging`), background port protocol from Task 8
- Produces: `class SummarySession { constructor(deps: SessionDeps); start(): Promise<void>; reposition(): void; destroy(): void }` with `interface SessionDeps { container: HTMLElement; text: string; getRect(): RectLike | null; anchor: Point; requestClose(): void }`

- [ ] **Step 1: Create `entrypoints/content/session.ts`**

```ts
import { createBubble, type Bubble } from '@/components/bubble';
import {
  SUMMARIZE_PORT,
  type OpenOptionsMessage,
  type PortResponse,
  type SummarizeRequest,
} from '@/utils/messaging';
import { bubblePosition, type Point, type RectLike } from '@/utils/positioning';
import { runLocalSummary } from './local-model';

type Port = ReturnType<typeof browser.runtime.connect>;

export interface SessionDeps {
  container: HTMLElement; // shadow-root UI container to append the bubble into
  text: string; // the selected text to summarize
  getRect(): RectLike | null; // live selection rect (viewport-relative)
  anchor: Point; // fallback position when the selection rect is gone
  requestClose(): void; // asks the owner to destroy this session
}

// Owns one summary's full lifecycle: bubble DOM, the local Gemini Nano
// attempt, the cloud port, the typewriter timer, and viewport listeners.
// destroy() is the single teardown path (single-flight guarantee).
export class SummarySession {
  private bubble: Bubble;
  private port: Port | null = null;
  private localAbort = new AbortController();
  private typeTimer: ReturnType<typeof setTimeout> | null = null;
  private pending = '';
  private destroyed = false;
  private detachViewportListeners: (() => void) | null = null;
  private rafId: number | null = null;

  constructor(private deps: SessionDeps) {
    this.bubble = createBubble(() => this.deps.requestClose());
  }

  async start(): Promise<void> {
    this.deps.container.appendChild(this.bubble.root);
    this.reposition();
    this.attachViewportListeners();

    // 1) Try on-device Gemini Nano — private, no key, no network.
    const result = await runLocalSummary(this.deps.text, this.localAbort.signal, {
      onStatus: (t) => this.bubble.setStatus(t),
      onReady: () => {
        this.bubble.setStatus('');
        this.bubble.hideLoading();
      },
      onDelta: (d) => {
        this.bubble.appendText(d);
        this.reposition();
      },
      isAlive: () => !this.destroyed,
    });
    if (this.destroyed || result === 'aborted') return;
    if (result === 'ok') {
      if (!this.bubble.getText()) this.bubble.setText('Hmm, I got nothing to say!');
      return;
    }

    // 2) Fall back to the configured cloud provider.
    this.startCloud();
  }

  // Re-anchor to the live selection rect (scroll/resize/streaming growth).
  reposition(): void {
    const height = this.bubble.root.getBoundingClientRect().height;
    const p = bubblePosition(this.deps.getRect(), this.deps.anchor, height, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    this.bubble.root.style.left = `${p.x}px`;
    this.bubble.root.style.top = `${p.y}px`;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.localAbort.abort();
    if (this.port) {
      try {
        this.port.disconnect(); // background aborts the fetch on disconnect
      } catch {
        // already gone
      }
      this.port = null;
    }
    if (this.typeTimer !== null) clearTimeout(this.typeTimer);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.detachViewportListeners?.();
    this.bubble.root.remove();
  }

  private startCloud(): void {
    this.bubble.setStatus('');
    let gotFirst = false;

    this.port = browser.runtime.connect({ name: SUMMARIZE_PORT });

    this.port.onMessage.addListener((raw: unknown) => {
      if (this.destroyed) return;
      const msg = raw as PortResponse;
      if (msg.type === 'chunk') {
        if (!gotFirst) {
          gotFirst = true;
          this.bubble.hideLoading();
        }
        this.enqueue(msg.text);
        this.reposition();
      } else if (msg.type === 'done') {
        this.bubble.hideLoading();
        if (!gotFirst && !this.bubble.getText()) {
          this.bubble.setText('Hmm, I got nothing to say!');
        }
      } else if (msg.type === 'not-configured') {
        this.bubble.showSetupPrompt(() => {
          const openOptions: OpenOptionsMessage = { type: 'open-options' };
          void browser.runtime.sendMessage(openOptions);
        });
      } else if (msg.type === 'error') {
        this.bubble.showError(msg.message);
      }
    });

    this.port.onDisconnect.addListener(() => {
      this.port = null;
    });

    const request: SummarizeRequest = { type: 'summarize', text: this.deps.text };
    this.port.postMessage(request);
  }

  // Light typewriter: reveal queued characters a few at a time.
  private enqueue(s: string): void {
    this.pending += s;
    if (this.typeTimer === null) this.reveal();
  }

  private reveal(): void {
    if (this.destroyed) return;
    if (this.pending.length) {
      const n = Math.max(2, Math.ceil(this.pending.length / 8));
      this.bubble.appendText(this.pending.slice(0, n));
      this.pending = this.pending.slice(n);
      this.typeTimer = setTimeout(() => this.reveal(), 20);
    } else {
      this.typeTimer = null;
    }
  }

  private attachViewportListeners(): void {
    const onViewportChange = () => {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.reposition();
      });
    };
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    this.detachViewportListeners = () => {
      window.removeEventListener('scroll', onViewportChange, { capture: true });
      window.removeEventListener('resize', onViewportChange);
    };
  }
}
```

- [ ] **Step 2: Create `entrypoints/content/index.ts`**

```ts
import '@/assets/content.css';
import { createIcon } from '@/components/icon';
import { clampIconPosition, type Point, type RectLike } from '@/utils/positioning';
import { SummarySession } from './session';

const MIN_SELECTION_LENGTH = 3;
const MAX_SELECTION_LENGTH = 8000; // don't ship a whole novel to the model

// Keys that can change a selection when held with Shift.
const SELECTION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    let icon: HTMLButtonElement | null = null;
    let uiContainer: HTMLElement | null = null;
    let session: SummarySession | null = null;
    let lastText = '';
    let lastAnchor: Point = { x: 100, y: 100 };

    const ui = await createShadowRootUi(ctx, {
      name: 'toddler-mode-ui',
      position: 'inline',
      anchor: 'body',
      onMount(container) {
        uiContainer = container;
        icon = createIcon(openBubble);
        container.appendChild(icon);
      },
      onRemove() {
        closeSession();
        icon = null;
        uiContainer = null;
      },
    });
    ui.mount();

    function isOwnTarget(e: Event): boolean {
      return e.composedPath().includes(ui.shadowHost);
    }

    function currentRect(): RectLike | null {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      try {
        return sel.getRangeAt(0).getBoundingClientRect();
      } catch {
        return null;
      }
    }

    function showIcon(x: number, y: number): void {
      if (!icon) return;
      const p = clampIconPosition(x, y, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      icon.style.left = `${p.x}px`;
      icon.style.top = `${p.y}px`;
      icon.style.display = 'flex';
    }

    function hideIcon(): void {
      if (icon) icon.style.display = 'none';
    }

    function handleSelection(e?: MouseEvent): void {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text || text.length < MIN_SELECTION_LENGTH) {
        hideIcon();
        return;
      }
      lastText = text.slice(0, MAX_SELECTION_LENGTH);
      const rect = currentRect();
      const x = e ? e.clientX + 6 : rect ? rect.right + 6 : 100;
      const y = e ? e.clientY + 6 : rect ? rect.top : 100;
      lastAnchor = { x, y };
      showIcon(x, y);
    }

    function openBubble(): void {
      if (!uiContainer) return;
      closeSession();
      hideIcon();
      session = new SummarySession({
        container: uiContainer,
        text: lastText,
        getRect: currentRect,
        anchor: lastAnchor,
        requestClose: closeSession,
      });
      void session.start();
    }

    function closeSession(): void {
      session?.destroy();
      session = null;
    }

    ctx.addEventListener(document, 'mouseup', (e) => {
      if (isOwnTarget(e)) return;
      // Defer a tick so the browser finalizes the selection first.
      setTimeout(() => handleSelection(e), 0);
    });

    ctx.addEventListener(document, 'mousedown', (e) => {
      if (isOwnTarget(e)) return;
      closeSession(); // click outside our UI closes the bubble
    });

    // Keyboard selections: shift+navigation keys, or select-all.
    ctx.addEventListener(document, 'keyup', (e) => {
      const selectAll = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a';
      if ((e.shiftKey && SELECTION_KEYS.has(e.key)) || selectAll) {
        setTimeout(() => handleSelection(), 0);
      }
    });

    ctx.addEventListener(document, 'keydown', (e) => {
      if (e.key === 'Escape') closeSession();
    });

    // Scroll: hide the icon; the open bubble repositions itself via its own
    // scroll listener (SummarySession.attachViewportListeners).
    ctx.addEventListener(
      window,
      'scroll',
      () => {
        hideIcon();
      },
      true,
    );
  },
});
```

- [ ] **Step 3: Full pipeline**

Run: `npm test && npm run check && npm run build` → all exit 0. Build output lists the `content` entrypoint; `.output/chrome-mv3/manifest.json` contains a `content_scripts` entry with `"matches":["<all_urls>"]`.

- [ ] **Step 4: Manual smoke (interactive environments only — skip in CI)**

Run: `npm run dev` (Chrome opens on the Wikipedia start URL).
Expected: select a paragraph → 🧸 appears near the cursor; click it → bubble streams a summary (on-device if available, cloud if configured, setup prompt otherwise); scrolling keeps the bubble attached to the selection; select text with Shift+ArrowRight → icon appears; Esc / ✕ / outside-click closes.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/session.ts entrypoints/content/index.ts
git commit -m "Add content entrypoint with SummarySession, keyboard selections, and scroll repositioning" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Options page — `entrypoints/options/` + `assets/options.css`

**Files:**
- Create: `entrypoints/options/index.html`, `entrypoints/options/main.ts`, `assets/options.css`

**Interfaces:**
- Consumes: `PROVIDER_DEFAULTS`, `providerItem`, `endpointItem`, `modelItem`, `apiKeyItem`, `Provider` (`@/utils/config`); Prompt API ambient types (Task 10)
- Produces: the options page (WXT wires it into the manifest automatically)

- [ ] **Step 1: Create `entrypoints/options/index.html`** (legacy markup minus inline CSS/JS)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Toddler Mode — Settings</title>
  </head>
  <body>
    <h1>🧸 Toddler Mode</h1>
    <p class="sub">Highlight text, tap the bear, get a baby-simple summary.</p>

    <h2>On-device AI (recommended)</h2>
    <p class="hint">
      Runs privately on your device with Chrome's built-in Gemini Nano — no key, nothing sent to a
      server. Used automatically whenever it's available.
    </p>
    <div class="status-card">
      <div id="localStatus">Checking…</div>
      <button type="button" id="downloadLocal">Set up on-device AI</button>
    </div>

    <hr />

    <h2>Cloud fallback (optional)</h2>
    <p class="hint">Used only when on-device AI isn't available on this device.</p>

    <div class="field">
      <label for="provider">AI provider</label>
      <select id="provider">
        <option value="openai">OpenAI (or any OpenAI-compatible)</option>
        <option value="anthropic">Anthropic (Claude)</option>
        <option value="custom">Custom endpoint</option>
      </select>
    </div>

    <div class="field">
      <label for="endpoint">API endpoint <span class="hint">— the full URL to call</span></label>
      <input type="text" id="endpoint" placeholder="https://api.openai.com/v1/chat/completions" />
    </div>

    <div class="field">
      <label for="apiKey">API key <span class="hint">— stored locally on this device only</span></label>
      <div class="key-row">
        <input type="password" id="apiKey" placeholder="sk-..." autocomplete="off" />
        <button type="button" id="toggleKey">Show</button>
      </div>
    </div>

    <div class="field">
      <label for="model">Model</label>
      <input type="text" id="model" placeholder="gpt-4o-mini" />
    </div>

    <div class="row">
      <button type="button" id="save">Save settings</button>
      <span id="status"></span>
    </div>

    <div class="note">
      Your API key lives in this browser's local storage and is sent only to the endpoint above.
      Provider, endpoint, and model sync across your signed-in browsers; the key never does.
    </div>

    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `assets/options.css`** (ported verbatim from the legacy inline `<style>`)

```css
:root {
  --orange: #ff9a6b;
  --orange-dark: #ff8654;
}
body {
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  max-width: 560px;
  margin: 40px auto;
  padding: 0 20px 60px;
  color: #1b1b1b;
  background: #fff;
}
h1 {
  font-size: 22px;
  display: flex;
  align-items: center;
  gap: 8px;
}
h2 {
  font-size: 16px;
  margin: 28px 0 4px;
}
p.sub {
  color: #555;
  margin-top: -6px;
  font-size: 14px;
}
hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 28px 0 0;
}
.field {
  margin: 16px 0;
}
label {
  display: block;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 6px;
}
.hint {
  font-weight: 400;
  color: #777;
  font-size: 12px;
}
input,
select {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  font-size: 14px;
  border: 1px solid #ccc;
  border-radius: 8px;
}
input:focus,
select:focus {
  outline: none;
  border-color: var(--orange);
  box-shadow: 0 0 0 3px rgba(255, 154, 107, 0.25);
}
.row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}
button#save {
  background: var(--orange);
  color: #fff;
  border: none;
  padding: 11px 22px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
button#save:hover {
  background: var(--orange-dark);
}
#status {
  color: #2e7d32;
  font-size: 14px;
  font-weight: 600;
}
.key-row {
  display: flex;
  gap: 8px;
}
.key-row button {
  flex: 0 0 auto;
  padding: 0 12px;
  border: 1px solid #ccc;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.status-card {
  margin-top: 8px;
  padding: 12px 14px;
  background: #f6faf6;
  border: 1px solid #dcebdc;
  border-radius: 10px;
  font-size: 14px;
}
#localStatus {
  font-weight: 600;
}
#downloadLocal {
  display: none;
  margin-top: 10px;
  background: var(--orange);
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
#downloadLocal:disabled {
  opacity: 0.6;
  cursor: default;
}
.note {
  margin-top: 24px;
  padding: 12px 14px;
  background: #fff7ef;
  border: 1px solid #ffe0c2;
  border-radius: 10px;
  font-size: 13px;
  color: #6b4a2b;
}
```

- [ ] **Step 3: Create `entrypoints/options/main.ts`**

```ts
import '@/assets/options.css';
import {
  PROVIDER_DEFAULTS,
  apiKeyItem,
  endpointItem,
  modelItem,
  providerItem,
  type Provider,
} from '@/utils/config';

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
  // Provider/endpoint/model are fine to sync; the key stays local only.
  await Promise.all([
    providerItem.setValue(providerEl.value as Provider),
    endpointItem.setValue(endpointEl.value.trim()),
    modelItem.setValue(modelEl.value.trim()),
    apiKeyItem.setValue(apiKeyEl.value.trim()),
  ]);
  flashStatus('Saved! 🎉');
});

function flashStatus(text: string): void {
  statusEl.textContent = text;
  setTimeout(() => {
    statusEl.textContent = '';
  }, 2000);
}

// Load saved settings on open.
async function load(): Promise<void> {
  const [provider, endpoint, model, apiKey] = await Promise.all([
    providerItem.getValue(),
    endpointItem.getValue(),
    modelItem.getValue(),
    apiKeyItem.getValue(),
  ]);
  providerEl.value = provider;
  const d = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.custom;
  endpointEl.value = endpoint || d.endpoint;
  modelEl.value = model || d.model;
  apiKeyEl.value = apiKey;
}

void load();
void refreshLocalStatus();
```

- [ ] **Step 4: Full pipeline**

Run: `npm test && npm run check && npm run build` → all exit 0; `.output/chrome-mv3/manifest.json` now contains an options page entry (`options_ui` or `options_page`) pointing at the built options HTML.

- [ ] **Step 5: Manual smoke (interactive environments only — skip in CI)**

Run: `npm run dev` → open the extension's options page.
Expected: on-device status card populates; switching provider fills defaults (`anthropic` → `https://api.anthropic.com/v1/messages` / `claude-haiku-4-5`); Save flashes "Saved! 🎉"; reopening the page restores saved values.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/options/index.html entrypoints/options/main.ts assets/options.css
git commit -m "Port options page to WXT entrypoint with typed config store" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Delete legacy files, rewrite README, final verification

**Files:**
- Delete: `manifest.json`, `content.js`, `background.js`, `options.html`, `options.js`
- Modify: `README.md` (full replacement below)

**Interfaces:**
- Consumes: everything above
- Produces: the finished migrated repo

- [ ] **Step 1: Delete the legacy files**

```bash
git rm manifest.json content.js background.js options.html options.js
```

(`icons/` was already moved in Task 2.)

- [ ] **Step 2: Replace `README.md` with:**

````markdown
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
npm run build      # production build into .output/chrome-mv3
npm run zip        # store-ready zip
```

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
  - Custom: any OpenAI-compatible endpoint.

Your API key is stored in `chrome.storage.local` (this device only, never synced) and is
only ever read by the background service worker. Provider / endpoint / model sync across
your signed-in browsers.

## Use

Highlight some text (mouse, or Shift+arrows / Ctrl-A) → click the 🧸 → read the bubble.
Press `Esc`, click the ✕, or click elsewhere to close it. The bubble stays anchored to
your selection while you scroll.

## Tweak the voice

The toddler personality is the `TODDLER_PROMPT` string in
[utils/prompt.ts](utils/prompt.ts) — one place, used by both the on-device and cloud paths.

## Notes

- The icons are generated placeholders (`python3 gen_icons.py` regenerates them into
  `public/icon/`); swap in your own PNGs anytime.
````

- [ ] **Step 3: Final verification**

Run: `npm test` → all suites pass (config, sse, stream-delta, positioning, providers, bubble).
Run: `npm run check` → exit 0.
Run: `npm run build` → exit 0. Then verify the built manifest:

```bash
cat .output/chrome-mv3/manifest.json
```

Expected: `"name":"Toddler Mode"`, `"permissions":["storage"]`, `"host_permissions":["<all_urls>"]`, background service worker, `content_scripts` matching `<all_urls>`, an options page entry, and icons 16/48/128.

Run: `git status --short` → only the deletions + README staged/committed; no stray files.

- [ ] **Step 4: Manual smoke (interactive environments only — skip in CI)**

Load `.output/chrome-mv3/` as an unpacked extension in a profile that previously used the legacy extension. Expected: previously saved provider/endpoint/model/key appear in options unchanged (storage-key compatibility), and the full select → 🧸 → bubble flow works.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Remove legacy plain-JS extension files and document the WXT workflow" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
