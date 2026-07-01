"use strict";

// Sensible per-provider defaults for the endpoint + model fields.
const DEFAULTS = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
  anthropic: {
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-haiku-4-5",
  },
  custom: {
    endpoint: "",
    model: "",
  },
};

const providerEl = document.getElementById("provider");
const endpointEl = document.getElementById("endpoint");
const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");
const toggleKeyEl = document.getElementById("toggleKey");

// When the provider changes, fill in that provider's defaults.
providerEl.addEventListener("change", () => {
  const d = DEFAULTS[providerEl.value] || DEFAULTS.custom;
  endpointEl.value = d.endpoint;
  modelEl.value = d.model;
});

toggleKeyEl.addEventListener("click", () => {
  const showing = apiKeyEl.type === "text";
  apiKeyEl.type = showing ? "password" : "text";
  toggleKeyEl.textContent = showing ? "Show" : "Hide";
});

saveEl.addEventListener("click", () => {
  const provider = providerEl.value;
  const endpoint = endpointEl.value.trim();
  const model = modelEl.value.trim();
  const apiKey = apiKeyEl.value.trim();

  // Provider/endpoint/model are fine to sync; the key stays local only.
  chrome.storage.sync.set({ provider, endpoint, model }, () => {
    chrome.storage.local.set({ apiKey }, () => {
      flashStatus("Saved! 🎉");
    });
  });
});

function flashStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2000);
}

// Load saved settings on open.
function load() {
  chrome.storage.sync.get(["provider", "endpoint", "model"], (sync) => {
    chrome.storage.local.get(["apiKey"], (local) => {
      const provider = sync.provider || "openai";
      providerEl.value = provider;
      const d = DEFAULTS[provider] || DEFAULTS.custom;
      endpointEl.value = sync.endpoint || d.endpoint;
      modelEl.value = sync.model || d.model;
      apiKeyEl.value = local.apiKey || "";
    });
  });
}

load();
