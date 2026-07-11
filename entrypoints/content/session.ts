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
