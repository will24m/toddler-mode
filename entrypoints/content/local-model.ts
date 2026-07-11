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
