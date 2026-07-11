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
    expect(errors[0]?.textContent).toBe('Uh oh! second');
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

  it('offers a retry button when showError gets a retry callback', () => {
    const onRetry = vi.fn();
    const bubble = createBubble(() => {});
    bubble.showError('boom', onRetry);
    const btn = bubble.root.querySelector('.tm-retry-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onRetry).toHaveBeenCalledOnce();
    // Retry resets the error slot and brings the loading dots back.
    expect(bubble.root.querySelector('.tm-error')).toBeNull();
    const loading = bubble.root.querySelector('.tm-loading') as HTMLElement;
    expect(loading.style.display).not.toBe('none');
  });

  it('renders no retry button without a callback', () => {
    const bubble = createBubble(() => {});
    bubble.showError('boom');
    expect(bubble.root.querySelector('.tm-retry-btn')).toBeNull();
  });

  it('hides the copy button until there is text to copy', () => {
    const bubble = createBubble(() => {});
    const btn = bubble.root.querySelector('.tm-copy') as HTMLButtonElement;
    expect(btn.style.display).toBe('none');
    bubble.appendText('words');
    expect(btn.style.display).not.toBe('none');
  });

  it('announces errors assertively for screen readers', () => {
    const bubble = createBubble(() => {});
    bubble.showError('boom');
    const error = bubble.root.querySelector('.tm-error') as HTMLElement;
    expect(error.getAttribute('role')).toBe('alert');
  });

  it('copies the summary text from the header copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const bubble = createBubble(() => {});
    bubble.appendText('tiny summary');
    const btn = bubble.root.querySelector('.tm-copy') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('tiny summary');
  });

  it('keeps the page selection alive — buttons prevent mousedown default', () => {
    const bubble = createBubble(() => {});
    const closeBtn = bubble.root.querySelector('.tm-close') as HTMLButtonElement;
    const e = new MouseEvent('mousedown', { cancelable: true, bubbles: true });
    closeBtn.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('shows a persistent note that survives status changes', () => {
    const bubble = createBubble(() => {});
    bubble.setNote('I read the first part!');
    bubble.setStatus('working…');
    bubble.setStatus('');
    const note = bubble.root.querySelector('.tm-note') as HTMLElement;
    expect(note.textContent).toBe('I read the first part!');
  });

  it('is announced as a dialog with labelled controls', () => {
    const bubble = createBubble(() => {});
    expect(bubble.root.getAttribute('role')).toBe('dialog');
    expect(bubble.root.getAttribute('aria-label')).toBeTruthy();
    const closeBtn = bubble.root.querySelector('.tm-close') as HTMLButtonElement;
    expect(closeBtn.getAttribute('aria-label')).toBeTruthy();
  });
});
