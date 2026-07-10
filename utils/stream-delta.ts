// Chrome's Prompt API promptStreaming yields the FULL text so far on each
// chunk — emit only the newly added suffix so text isn't repeated. If a chunk
// is not a prefix-extension (some implementations stream raw deltas), treat
// it as a delta and append it to the running text.
export function createDeltaExtractor(): (chunk: unknown) => string {
  let prev = '';
  return (chunk: unknown): string => {
    const text = String(chunk);
    let delta: string;
    if (text.startsWith(prev)) {
      delta = text.slice(prev.length);
      prev = text;
    } else {
      delta = text;
      prev += delta;
    }
    return delta;
  };
}
