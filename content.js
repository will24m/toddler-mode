(() => {
  "use strict";

  const ICON_SIZE = 30;
  const MIN_SELECTION_LENGTH = 3;
  const MAX_SELECTION_LENGTH = 8000; // don't ship a whole novel to the model

  const HOST_ID = "toddler-mode-host";

  // The toddler voice. Kept in sync with the same constant in background.js
  // (used there for the cloud fallback path).
  const TODDLER_PROMPT =
    "You explain things to a 3-year-old. Read the text and say what it means " +
    "using only short, simple words a small kid knows. Keep it to 2 or 3 short " +
    "sentences. Be warm, fun, and a little silly. Never use big or fancy words. " +
    "Do not mention that you are an AI.";

  let host = null;
  let shadow = null;
  let iconEl = null;
  let bubbleEl = null;

  let currentPort = null; // cloud fallback port
  let localSession = null; // on-device Gemini Nano session
  let localController = null; // aborts the on-device request

  let lastSelectionText = "";
  let lastRect = null; // viewport-relative rect of the selection
  let lastAnchor = { x: 100, y: 100 }; // mouse release point (for the icon)

  // ---- Shadow host (style isolation from the page) -----------------------

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.appendChild(style);
    (document.body || document.documentElement).appendChild(host);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function isOwnTarget(target) {
    return !!(target && target.closest && target.closest("#" + HOST_ID));
  }

  // ---- Floating icon -----------------------------------------------------

  function showIcon(x, y) {
    ensureHost();
    if (!iconEl) {
      iconEl = el("button", "tm-icon");
      iconEl.type = "button";
      iconEl.title = "Explain like I'm a toddler";
      iconEl.textContent = "🧸";
      // Keep the page selection alive when the icon is pressed.
      iconEl.addEventListener("mousedown", (e) => e.preventDefault());
      iconEl.addEventListener("click", (e) => {
        e.stopPropagation();
        openBubble();
      });
      shadow.appendChild(iconEl);
    }
    const left = Math.min(Math.max(x, 8), window.innerWidth - ICON_SIZE - 8);
    const top = Math.min(Math.max(y, 8), window.innerHeight - ICON_SIZE - 8);
    iconEl.style.left = left + "px";
    iconEl.style.top = top + "px";
    iconEl.style.display = "flex";
  }

  function hideIcon() {
    if (iconEl) iconEl.style.display = "none";
  }

  // ---- Selection detection ----------------------------------------------

  function handleSelection(e) {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text || text.length < MIN_SELECTION_LENGTH) {
      hideIcon();
      return;
    }
    lastSelectionText = text.slice(0, MAX_SELECTION_LENGTH);
    try {
      lastRect = sel.getRangeAt(0).getBoundingClientRect();
    } catch (_) {
      lastRect = null;
    }
    const x = e && typeof e.clientX === "number" ? e.clientX + 6 : lastRect ? lastRect.right + 6 : 100;
    const y = e && typeof e.clientY === "number" ? e.clientY + 6 : lastRect ? lastRect.top : 100;
    lastAnchor = { x, y };
    showIcon(x, y);
  }

  document.addEventListener("mouseup", (e) => {
    if (isOwnTarget(e.target)) return;
    // Defer a tick so the browser finalizes the selection first.
    setTimeout(() => handleSelection(e), 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (isOwnTarget(e.target)) return;
    closeBubble(); // click outside our UI closes the bubble
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeBubble();
  });

  // Fixed-position UI would drift on scroll — hide the icon, drop the bubble.
  window.addEventListener("scroll", () => hideIcon(), true);

  // ---- Bubble ------------------------------------------------------------

  function openBubble() {
    ensureHost();
    closeBubble();
    hideIcon();

    bubbleEl = el("div", "tm-bubble");

    const header = el("div", "tm-header");
    header.appendChild(el("span", "tm-title", "🧸 Toddler Mode"));
    const closeBtn = el("button", "tm-close", "✕");
    closeBtn.type = "button";
    closeBtn.title = "Close";
    closeBtn.addEventListener("click", closeBubble);
    header.appendChild(closeBtn);

    const body = el("div", "tm-body");
    const loading = el("div", "tm-loading");
    loading.appendChild(el("span", "tm-dot"));
    loading.appendChild(el("span", "tm-dot"));
    loading.appendChild(el("span", "tm-dot"));
    const status = el("div", "tm-status");
    const textEl = el("div", "tm-text");
    body.appendChild(loading);
    body.appendChild(status);
    body.appendChild(textEl);

    bubbleEl.appendChild(header);
    bubbleEl.appendChild(body);
    shadow.appendChild(bubbleEl);

    positionBubble();
    runSummary(textEl, loading, status, body);
  }

  function closeBubble() {
    // Abort on-device work.
    if (localController) {
      try {
        localController.abort();
      } catch (_) {
        /* ignore */
      }
    }
    destroyLocal();
    // Abort cloud work.
    if (currentPort) {
      try {
        currentPort.disconnect();
      } catch (_) {
        /* already gone */
      }
      currentPort = null;
    }
    if (bubbleEl) {
      bubbleEl.remove();
      bubbleEl = null;
    }
  }

  function positionBubble() {
    if (!bubbleEl) return;
    const width = 300;
    const margin = 10;
    const rect = lastRect;

    let left = rect ? rect.left : lastAnchor.x;
    let top = rect ? rect.bottom + 8 : lastAnchor.y;

    const measured = bubbleEl.getBoundingClientRect();
    const h = measured.height || 120;

    // Flip above the selection if there isn't room below.
    if (rect && top + h > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - h - 8);
    }
    left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
    top = Math.min(Math.max(margin, top), window.innerHeight - h - margin);

    bubbleEl.style.left = left + "px";
    bubbleEl.style.top = top + "px";
  }

  // ---- Summary orchestration (local first, cloud fallback) ---------------

  async function runSummary(textEl, loadingEl, statusEl, body) {
    // 1) Try on-device Gemini Nano — private, no key, no network.
    const result = await tryLocalSummary(textEl, loadingEl, statusEl);
    if (result === "ok" || result === "aborted") return;

    // 2) Fall back to the configured cloud provider.
    const config = await getConfig();
    if (!isConfigComplete(config)) {
      showSetupPrompt(body, loadingEl, statusEl);
      return;
    }
    streamCloud(config, textEl, loadingEl, statusEl);
  }

  // Returns "ok" | "aborted" | "unavailable".
  async function tryLocalSummary(textEl, loadingEl, statusEl) {
    if (typeof LanguageModel === "undefined") return "unavailable";

    let availability;
    try {
      availability = await LanguageModel.availability();
    } catch (_) {
      return "unavailable";
    }
    if (!availability || availability === "unavailable") return "unavailable";

    localController = new AbortController();
    const signal = localController.signal;

    try {
      if (availability !== "available") {
        statusEl.textContent = "Getting my brain ready…";
      }

      const session = await LanguageModel.create({
        initialPrompts: [{ role: "system", content: TODDLER_PROMPT }],
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            if (!bubbleEl) return;
            const frac = e && e.total ? e.loaded / e.total : e ? e.loaded : 0;
            statusEl.textContent = "Getting my brain ready… " + Math.round((frac || 0) * 100) + "%";
          });
        },
        signal,
      });

      if (!bubbleEl) {
        destroyLocal();
        return "aborted";
      }
      localSession = session;
      statusEl.textContent = "";
      loadingEl.style.display = "none";

      // promptStreaming yields the FULL text so far on each chunk — emit only
      // the newly added suffix so we don't repeat text.
      const stream = session.promptStreaming(lastSelectionText, { signal });
      let prev = "";
      for await (const chunk of stream) {
        if (!bubbleEl) break;
        let delta;
        if (typeof chunk === "string" && chunk.startsWith(prev)) {
          delta = chunk.slice(prev.length);
          prev = chunk;
        } else {
          delta = String(chunk);
          prev += delta;
        }
        if (delta) textEl.textContent += delta;
        positionBubble();
      }

      destroyLocal();
      if (bubbleEl && !textEl.textContent) textEl.textContent = "Hmm, I got nothing to say!";
      return "ok";
    } catch (err) {
      destroyLocal();
      if (err && err.name === "AbortError") return "aborted";
      // On-device failed unexpectedly — let the caller try the cloud.
      return "unavailable";
    }
  }

  function destroyLocal() {
    if (localSession) {
      try {
        localSession.destroy();
      } catch (_) {
        /* ignore */
      }
      localSession = null;
    }
    localController = null;
  }

  // ---- Cloud fallback (streams over a port to the service worker) --------

  function streamCloud(config, textEl, loadingEl, statusEl) {
    statusEl.textContent = "";
    let pending = "";
    let timer = null;
    let gotFirst = false;

    // Light typewriter: reveal queued characters a few at a time.
    function reveal() {
      if (pending.length) {
        const n = Math.max(2, Math.ceil(pending.length / 8));
        textEl.textContent += pending.slice(0, n);
        pending = pending.slice(n);
        timer = setTimeout(reveal, 20);
      } else {
        timer = null;
      }
    }
    function enqueue(s) {
      pending += s;
      if (!timer) reveal();
    }

    currentPort = chrome.runtime.connect({ name: "summarize" });

    currentPort.onMessage.addListener((msg) => {
      if (!bubbleEl) return;
      if (msg.type === "chunk") {
        if (!gotFirst) {
          gotFirst = true;
          loadingEl.style.display = "none";
        }
        enqueue(msg.text);
        positionBubble();
      } else if (msg.type === "done") {
        loadingEl.style.display = "none";
        if (!gotFirst && !textEl.textContent) {
          textEl.textContent = "Hmm, I got nothing to say!";
        }
      } else if (msg.type === "error") {
        loadingEl.style.display = "none";
        showError(textEl, msg.message);
      }
    });

    currentPort.onDisconnect.addListener(() => {
      currentPort = null;
    });

    currentPort.postMessage({ type: "summarize", text: lastSelectionText, config });
  }

  function showError(textEl, message) {
    const errEl = el("div", "tm-error", "Uh oh! " + (message || "Something broke."));
    textEl.parentNode.appendChild(errEl);
  }

  function showSetupPrompt(body, loadingEl, statusEl) {
    loadingEl.style.display = "none";
    statusEl.textContent = "";
    body.appendChild(
      el("div", "tm-text", "I can't find on-device AI here, and there's no cloud key yet. Let's set one up!")
    );
    const btn = el("button", "tm-setup-btn", "Open settings");
    btn.type = "button";
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-options" });
    });
    body.appendChild(btn);
  }

  // ---- Config (cloud fallback creds) -------------------------------------

  function getConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["provider", "endpoint", "model"], (syncData) => {
        chrome.storage.local.get(["apiKey"], (localData) => {
          resolve({
            provider: syncData.provider,
            endpoint: syncData.endpoint,
            model: syncData.model,
            apiKey: localData.apiKey,
          });
        });
      });
    });
  }

  function isConfigComplete(c) {
    return !!(c && c.apiKey && c.endpoint && c.model && c.provider);
  }

  // ---- Styles (scoped to the shadow root) --------------------------------

  const STYLES = `
    :host { all: initial; }

    .tm-icon {
      position: fixed;
      width: ${ICON_SIZE}px; height: ${ICON_SIZE}px;
      display: none;
      align-items: center; justify-content: center;
      font-size: 16px; line-height: 1;
      background: #ffffff;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 50%;
      box-shadow: 0 2px 10px rgba(0,0,0,0.18);
      cursor: pointer;
      padding: 0; margin: 0;
      pointer-events: auto;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      transition: transform 0.08s ease;
    }
    .tm-icon:hover { transform: scale(1.1); }

    .tm-bubble {
      position: fixed;
      width: 300px;
      max-width: calc(100vw - 20px);
      background: #ffffff;
      color: #1b1b1b;
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 14px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.22);
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      pointer-events: auto;
      overflow: hidden;
    }

    .tm-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px;
      background: linear-gradient(135deg, #ffd56b, #ff9a6b);
      color: #4a2c00;
      font-weight: 700; font-size: 13px;
    }
    .tm-title { user-select: none; }
    .tm-close {
      background: rgba(255,255,255,0.4);
      border: none; border-radius: 50%;
      width: 20px; height: 20px;
      cursor: pointer; font-size: 12px; line-height: 1;
      color: #4a2c00;
      display: flex; align-items: center; justify-content: center;
      padding: 0;
    }
    .tm-close:hover { background: rgba(255,255,255,0.75); }

    .tm-body { padding: 14px; }
    .tm-status { font-size: 13px; color: #777; margin-bottom: 6px; }
    .tm-status:empty { margin: 0; }
    .tm-text {
      font-size: 16px; line-height: 1.5;
      white-space: pre-wrap; word-wrap: break-word;
    }
    .tm-error { margin-top: 8px; color: #b00020; font-size: 14px; }

    .tm-setup-btn {
      margin-top: 10px;
      background: #ff9a6b; color: #ffffff; border: none;
      padding: 8px 14px; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 600;
    }
    .tm-setup-btn:hover { background: #ff8654; }

    .tm-loading { display: flex; gap: 5px; padding: 4px 0; }
    .tm-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #ff9a6b;
      animation: tm-blink 1s infinite ease-in-out;
    }
    .tm-dot:nth-child(2) { animation-delay: 0.2s; }
    .tm-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes tm-blink {
      0%, 100% { opacity: 0.3; transform: translateY(0); }
      50% { opacity: 1; transform: translateY(-3px); }
    }
  `;
})();
