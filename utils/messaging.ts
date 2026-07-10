// Typed protocol for all content <-> background messaging.

export const SUMMARIZE_PORT = 'summarize';

// Content -> background, over the summarize port. Text only — never config or keys.
export interface SummarizeRequest {
  type: 'summarize';
  text: string;
}

// Background -> content, over the summarize port.
export type PortResponse =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'not-configured' }
  | { type: 'error'; message: string };

// One-off runtime message: content scripts can't call openOptionsPage themselves.
export interface OpenOptionsMessage {
  type: 'open-options';
}
