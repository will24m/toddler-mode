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
