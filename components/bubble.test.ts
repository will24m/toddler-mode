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
