// Typed protocol for all content <-> background messaging.

export const SUMMARIZE_PORT = 'summarize';

// Selection bounds, enforced on BOTH sides of the port: the content script
// applies them for UX, and the background re-applies them so it never
// forwards unbounded input to an API even if a compromised page process
// speaks the port protocol directly.
export const MIN_SELECTION_LENGTH = 3;
export const MAX_SELECTION_LENGTH = 8000; // don't ship a whole novel to the model

// Content -> background, over the summarize port. Text only — never config or keys.
export interface SummarizeRequest {
  type: 'summarize';
  text: string;
}

// Strict parse of an untrusted port message. Returns the normalized text
// (trimmed, capped at MAX_SELECTION_LENGTH) or null if the message is not a
// well-formed summarize request.
export function parseSummarizeText(msg: unknown): string | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const { type, text } = msg as { type?: unknown; text?: unknown };
  if (type !== 'summarize' || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length < MIN_SELECTION_LENGTH) return null;
  return trimmed.slice(0, MAX_SELECTION_LENGTH);
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
