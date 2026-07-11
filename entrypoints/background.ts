import { isConfigComplete, loadCloudConfig } from '@/utils/config';
import { endpointOriginPattern, validateEndpoint } from '@/utils/endpoint';
import { type PortResponse, parseSummarizeText, SUMMARIZE_PORT } from '@/utils/messaging';
import { buildRequest } from '@/utils/providers';
import { createSseLineSplitter } from '@/utils/sse';

// Abort the fetch if no bytes arrive for this long — a stalled stream would
// otherwise leave the bubble's loading dots bouncing forever.
const STALL_TIMEOUT_MS = 20_000;

type Port = ReturnType<typeof browser.runtime.connect>;

export default defineBackground(() => {
  // One-time onboarding: the options page explains on-device AI status and
  // the optional cloud setup. Fresh installs only — never on update.
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') browser.runtime.openOptionsPage();
  });

  // The action has no popup, so make the toolbar button do the obvious
  // thing instead of nothing.
  browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage();
  });

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

    port.onMessage.addListener((msg: unknown) => {
      // Strict parse — the background never trusts the port message shape.
      const text = parseSummarizeText(msg);
      if (text === null) {
        // Always answer, even garbage — a silent drop would leave the
        // bubble's loading dots animating forever.
        post(port, { type: 'error', message: 'Something went wrong. Try selecting again.' });
        return;
      }
      runSummarize(text, port, controller).catch((err) => {
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

async function runSummarize(text: string, port: Port, controller: AbortController): Promise<void> {
  // Config (including the API key) is loaded HERE — it never transits the
  // content script or the port.
  const config = await loadCloudConfig();
  if (!isConfigComplete(config)) {
    post(port, { type: 'not-configured' });
    return;
  }

  const request = buildRequest(text, config);

  // Same policy the options page enforces on save; re-checked here so a bad
  // endpoint can never be fetched no matter how it got into storage.
  const endpointProblem = validateEndpoint(request.url);
  if (endpointProblem) throw new Error(endpointProblem);

  const origin = endpointOriginPattern(request.url);
  const granted = origin && (await browser.permissions.contains({ origins: [origin] }));
  if (!granted) {
    throw new Error(
      'Toddler Mode needs permission to reach this endpoint — open the extension settings and save them again to grant it.',
    );
  }

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

  // Coalesce parsed tokens so a chatty SSE stream doesn't become one port
  // message (and one content-script wakeup) per token. ~15ms matches the
  // typewriter cadence on the receiving side.
  let tokenBuffer = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushTokens = () => {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (tokenBuffer) {
      post(port, { type: 'chunk', text: tokenBuffer });
      tokenBuffer = '';
    }
  };

  try {
    const res = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
      // The API key rides in a header; never let it follow a redirect to a
      // different origin. The supported APIs don't redirect anyway.
      redirect: 'error',
    });

    if (!res.ok) {
      const errText = await safeReadText(res);
      throw new Error(`API ${res.status} — ${truncate(errText, 300) || 'request failed'}`);
    }
    if (!res.body) throw new Error('No response stream from the API.');

    const splitter = createSseLineSplitter((line) => {
      const token = request.parseLine(line);
      if (!token) return;
      tokenBuffer += token;
      if (flushTimer === null) flushTimer = setTimeout(flushTokens, 15);
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

    flushTokens();
    post(port, { type: 'done' });
  } catch (err) {
    if (stalled) throw new Error('The API stopped responding. Try again.');
    throw err;
  } finally {
    // Deliver any partial text before an error reaches the bubble.
    flushTokens();
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
