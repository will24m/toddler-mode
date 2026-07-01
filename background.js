"use strict";

// The heart of it: the toddler voice. Tweak this string to change the vibe.
const TODDLER_PROMPT =
  "You explain things to a 3-year-old. Read the text and say what it means " +
  "using only short, simple words a small kid knows. Keep it to 2 or 3 short " +
  "sentences. Be warm, fun, and a little silly. Never use big or fancy words. " +
  "Do not mention that you are an AI.";

const ANTHROPIC_VERSION = "2023-06-01";

// Open the options page when the content script asks (content scripts can't
// call chrome.runtime.openOptionsPage themselves).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "open-options") {
    chrome.runtime.openOptionsPage();
  }
});

// Streaming summaries flow over a long-lived port so we can push tokens
// incrementally back to the content script.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "summarize") return;

  const controller = new AbortController();
  let active = true;

  port.onDisconnect.addListener(() => {
    active = false;
    controller.abort(); // abort the in-flight fetch when the bubble closes
  });

  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "summarize") return;
    runSummarize(msg.text, msg.config, port, controller.signal).catch((err) => {
      if (active) safePost(port, { type: "error", message: errToMessage(err) });
    });
  });
});

function safePost(port, message) {
  try {
    port.postMessage(message);
  } catch (_) {
    // Port already closed — ignore.
  }
}

async function runSummarize(text, config, port, signal) {
  const provider = config.provider || "openai";
  const { request, parseLine } = buildRequest(provider, text, config);

  const res = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal,
  });

  if (!res.ok) {
    const errText = await safeReadText(res);
    throw new Error(`API ${res.status} — ${truncate(errText, 300) || "request failed"}`);
  }
  if (!res.body) throw new Error("No response stream from the API.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are newline-delimited; keep the trailing partial line.
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const token = parseLine(line);
      if (token) safePost(port, { type: "chunk", text: token });
    }
  }

  // Flush any remaining buffered line.
  buffer += decoder.decode();
  if (buffer) {
    const token = parseLine(buffer);
    if (token) safePost(port, { type: "chunk", text: token });
  }

  safePost(port, { type: "done" });
}

// Build the provider-specific request and the matching SSE line parser.
function buildRequest(provider, text, config) {
  if (provider === "anthropic") {
    return {
      request: {
        url: config.endpoint || "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: {
          model: config.model,
          max_tokens: 200,
          stream: true,
          system: TODDLER_PROMPT,
          messages: [{ role: "user", content: text }],
        },
      },
      parseLine: parseAnthropicLine,
    };
  }

  // OpenAI-compatible (also used for "custom" endpoints).
  return {
    request: {
      url: config.endpoint || "https://api.openai.com/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: {
        model: config.model,
        stream: true,
        messages: [
          { role: "system", content: TODDLER_PROMPT },
          { role: "user", content: text },
        ],
      },
    },
    parseLine: parseOpenAILine,
  };
}

// OpenAI: `data: {"choices":[{"delta":{"content":"..."}}]}` / `data: [DONE]`.
function parseOpenAILine(line) {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    const json = JSON.parse(data);
    return (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) || null;
  } catch (_) {
    return null;
  }
}

// Anthropic: `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}`.
function parseAnthropicLine(line) {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data) return null;
  try {
    const json = JSON.parse(data);
    if (json.type === "content_block_delta" && json.delta && json.delta.type === "text_delta") {
      return json.delta.text || null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch (_) {
    return "";
  }
}

function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function errToMessage(err) {
  if (err && err.name === "AbortError") return "Stopped.";
  if (err && err.message && /Failed to fetch/i.test(err.message)) {
    return "Could not reach the API. Check the endpoint URL and your connection.";
  }
  return (err && err.message) || "Something went wrong.";
}
