// Minimal ambient types for Chrome's built-in Prompt API (Gemini Nano).
// Only the surface this extension uses.

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelMonitor {
  addEventListener(
    type: 'downloadprogress',
    listener: (e: { loaded: number; total?: number }) => void,
  ): void;
}

interface LanguageModelSession {
  promptStreaming(input: string, options?: { signal?: AbortSignal }): AsyncIterable<string>;
  destroy(): void;
}

declare class LanguageModel {
  static availability(): Promise<LanguageModelAvailability>;
  static create(options?: {
    initialPrompts?: { role: string; content: string }[];
    monitor?(m: LanguageModelMonitor): void;
    signal?: AbortSignal;
  }): Promise<LanguageModelSession>;
}
