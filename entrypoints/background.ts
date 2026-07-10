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
