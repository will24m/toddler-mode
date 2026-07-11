// Shared math for Prompt API downloadprogress events (used by the options
// page and the content script's local-model path). Some Chrome versions
// omit `total`, in which case `loaded` is already a 0..1 fraction.
export function downloadProgressPercent(e: { loaded: number; total?: number } | null): number {
  const frac = e?.total ? e.loaded / e.total : (e?.loaded ?? 0);
  return Math.round((frac || 0) * 100);
}
