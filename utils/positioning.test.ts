import { describe, expect, it } from 'vitest';
import {
  BUBBLE_WIDTH,
  ICON_SIZE,
  bubblePosition,
  clampIconPosition,
} from '@/utils/positioning';

const vp = { width: 1000, height: 800 };

describe('clampIconPosition', () => {
  it('passes through positions well inside the viewport', () => {
    expect(clampIconPosition(200, 300, vp)).toEqual({ x: 200, y: 300 });
  });

  it('clamps to all four edges with an 8px margin', () => {
    expect(clampIconPosition(-50, -50, vp)).toEqual({ x: 8, y: 8 });
    expect(clampIconPosition(5000, 5000, vp)).toEqual({
      x: vp.width - ICON_SIZE - 8,
      y: vp.height - ICON_SIZE - 8,
    });
  });
});

describe('bubblePosition', () => {
  const rect = { left: 100, top: 200, right: 400, bottom: 220 };

  it('places the bubble below the selection by default', () => {
    expect(bubblePosition(rect, { x: 0, y: 0 }, 120, vp)).toEqual({ x: 100, y: 228 });
  });

  it('flips above the selection when there is no room below', () => {
    const lowRect = { left: 100, top: 700, right: 400, bottom: 780 };
    // top would be 788; 788 + 120 > 790, so flip: 700 - 120 - 8 = 572
    expect(bubblePosition(lowRect, { x: 0, y: 0 }, 120, vp).y).toBe(572);
  });

  it('clamps horizontally so the bubble stays in the viewport', () => {
    const rightRect = { left: 950, top: 200, right: 990, bottom: 220 };
    expect(bubblePosition(rightRect, { x: 0, y: 0 }, 120, vp).x).toBe(
      vp.width - BUBBLE_WIDTH - 10,
    );
  });

  it('falls back to the anchor point when there is no rect', () => {
    expect(bubblePosition(null, { x: 300, y: 400 }, 120, vp)).toEqual({ x: 300, y: 400 });
  });

  it('uses a 120px height estimate when measured height is 0', () => {
    const lowRect = { left: 100, top: 700, right: 400, bottom: 780 };
    expect(bubblePosition(lowRect, { x: 0, y: 0 }, 0, vp).y).toBe(572);
  });

  it('never pushes the bubble off-screen on viewports narrower than the bubble', () => {
    // CSS caps the rendered width at 100vw - 20px, so the clamp must use the
    // effective width, not the 300px constant.
    const narrow = { width: 280, height: 800 };
    expect(bubblePosition(rect, { x: 0, y: 0 }, 120, narrow).x).toBe(10);
  });
});
