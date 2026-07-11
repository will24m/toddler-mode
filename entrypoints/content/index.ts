import '@/assets/content.css';
import { createIcon } from '@/components/icon';
import { MAX_SELECTION_LENGTH, MIN_SELECTION_LENGTH } from '@/utils/messaging';
import { clampIconPosition, type Point, type RectLike } from '@/utils/positioning';
import { SummarySession } from './session';

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
