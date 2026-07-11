export interface Bubble {
  root: HTMLDivElement;
  setStatus(text: string): void;
  hideLoading(): void;
  appendText(delta: string): void;
  setText(text: string): void;
  getText(): string;
  showError(message: string, onRetry?: () => void): void;
  showSetupPrompt(onOpenSettings: () => void): void;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className: string, text: string, label: string): HTMLButtonElement {
  const btn = el('button', className, text) as HTMLButtonElement;
  btn.type = 'button';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  // Keep the page selection alive when any bubble button is pressed — the
  // session re-anchors to the live selection rect on scroll.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  return btn;
}

export function createBubble(onClose: () => void): Bubble {
  const root = el('div', 'tm-bubble') as HTMLDivElement;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Toddler Mode summary');

  const header = el('div', 'tm-header');
  header.appendChild(el('span', 'tm-title', '🧸 Toddler Mode'));
  const headerBtns = el('div', 'tm-header-btns');
  const copyBtn = button('tm-copy', '⧉', 'Copy summary');
  const closeBtn = button('tm-close', '✕', 'Close');
  closeBtn.addEventListener('click', onClose);
  headerBtns.appendChild(copyBtn);
  headerBtns.appendChild(closeBtn);
  header.appendChild(headerBtns);

  const body = el('div', 'tm-body');
  const loading = el('div', 'tm-loading');
  loading.appendChild(el('span', 'tm-dot'));
  loading.appendChild(el('span', 'tm-dot'));
  loading.appendChild(el('span', 'tm-dot'));
  const status = el('div', 'tm-status');
  status.setAttribute('role', 'status');
  const textEl = el('div', 'tm-text');
  body.appendChild(loading);
  body.appendChild(status);
  body.appendChild(textEl);

  root.appendChild(header);
  root.appendChild(body);

  copyBtn.addEventListener('click', () => {
    const text = textEl.textContent ?? '';
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => flashCopy('✓'))
      .catch(() => flashCopy('✕'));
  });

  let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
  function flashCopy(mark: string): void {
    copyBtn.textContent = mark;
    if (copyResetTimer !== null) clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyBtn.textContent = '⧉';
      copyResetTimer = null;
    }, 1200);
  }

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
    showError(message, onRetry) {
      loading.style.display = 'none';
      if (!errorEl) {
        errorEl = el('div', 'tm-error');
        body.appendChild(errorEl);
      }
      errorEl.textContent = `Uh oh! ${message || 'Something broke.'}`;
      if (onRetry) {
        const retryBtn = button('tm-retry-btn', 'Try again', 'Try again');
        retryBtn.addEventListener('click', () => {
          // Reset to the fresh-bubble look, then let the owner re-run.
          errorEl?.remove();
          errorEl = null;
          loading.style.display = '';
          status.textContent = '';
          onRetry();
        });
        errorEl.appendChild(retryBtn);
      }
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
      const btn = button('tm-setup-btn', 'Open settings', 'Open settings');
      btn.addEventListener('click', onOpenSettings);
      body.appendChild(btn);
    },
  };
}
