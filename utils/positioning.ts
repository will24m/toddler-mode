// Pure placement math for the floating icon and bubble. Viewport-relative
// coordinates in, viewport-relative coordinates out — no DOM access.

export const ICON_SIZE = 30; // must match .tm-icon width/height in assets/content.css
export const BUBBLE_WIDTH = 300; // must match .tm-bubble width in assets/content.css

const BUBBLE_MARGIN = 10;
const ICON_MARGIN = 8;
const GAP = 8; // gap between the selection rect and the bubble
const FALLBACK_BUBBLE_HEIGHT = 120;

export interface Point {
  x: number;
  y: number;
}

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export function clampIconPosition(x: number, y: number, vp: Viewport): Point {
  return {
    x: Math.min(Math.max(x, ICON_MARGIN), vp.width - ICON_SIZE - ICON_MARGIN),
    y: Math.min(Math.max(y, ICON_MARGIN), vp.height - ICON_SIZE - ICON_MARGIN),
  };
}

export function bubblePosition(
  rect: RectLike | null,
  anchor: Point,
  bubbleHeight: number,
  vp: Viewport,
): Point {
  const h = bubbleHeight || FALLBACK_BUBBLE_HEIGHT;

  let left = rect ? rect.left : anchor.x;
  let top = rect ? rect.bottom + GAP : anchor.y;

  // Flip above the selection if there isn't room below.
  if (rect && top + h > vp.height - BUBBLE_MARGIN) {
    top = Math.max(BUBBLE_MARGIN, rect.top - h - GAP);
  }
  left = Math.min(Math.max(BUBBLE_MARGIN, left), vp.width - BUBBLE_WIDTH - BUBBLE_MARGIN);
  top = Math.min(Math.max(BUBBLE_MARGIN, top), vp.height - h - BUBBLE_MARGIN);

  return { x: left, y: top };
}
