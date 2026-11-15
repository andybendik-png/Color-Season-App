/**
 * Robust colour sampling from a frame region.
 *  - Only pixels inside the circle are used.
 *  - Pixels are ordered by luma; the darkest 10% (shadows, gaps) and brightest 15% (specular
 *    highlights, reflections) are discarded.
 *  - The colour is the per-channel median of the remaining pixels (robust to noise and isolated
 *    pixels, unlike a plain mean).
 *  - Spatial spread = 75th percentile of CIE76 distance of the kept pixels to the median colour.
 */
import { describeSrgb, type Vec3, type Lab } from './colourConversion';
import { deltaE76, deltaE2000 } from './deltaE';

export type Stability = 'Stable' | 'Moderate variation' | 'Unstable / mixed colours';
export interface SampleResult { srgb: Vec3; spread: number; pixels: number; kept: number }

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

export function sampleCircle(data: Uint8ClampedArray, width: number, height: number, cx: number, cy: number, radius: number): SampleResult | null {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius));
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  const step = Math.max(1, Math.floor(Math.sqrt(area / 6000))); // cap work at ~6k pixels
  const px: { r: number; g: number; b: number; y: number }[] = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      px.push({ r, g, b, y: 0.2126 * r + 0.7152 * g + 0.0722 * b });
    }
  }
  if (!px.length) return null;
  px.sort((a, b) => a.y - b.y);
  const lo = Math.floor(px.length * 0.1), hi = Math.ceil(px.length * 0.85);
  const kept = px.length >= 10 ? px.slice(lo, hi) : px;
  const srgb: Vec3 = [median(kept.map((p) => p.r)) / 255, median(kept.map((p) => p.g)) / 255, median(kept.map((p) => p.b)) / 255];
  const ref = describeSrgb(srgb).lab;
  const stride = Math.max(1, Math.floor(kept.length / 400));
  const dists: number[] = [];
  for (let i = 0; i < kept.length; i += stride) {
    const p = kept[i];
    dists.push(deltaE76(ref, describeSrgb([p.r / 255, p.g / 255, p.b / 255]).lab));
  }
  return { srgb, spread: percentile(dists, 0.75), pixels: px.length, kept: kept.length };
}

/** Temporal spread: max CIEDE2000 of recent samples from their per-channel median. */
export function temporalSpread(recent: Lab[]): number {
  if (recent.length < 2) return 0;
  const m: Lab = { L: median(recent.map((l) => l.L)), a: median(recent.map((l) => l.a)), b: median(recent.map((l) => l.b)) };
  return Math.max(...recent.map((l) => deltaE2000(l, m)));
}

export function stabilityOf(spatial: number, temporal: number): Stability {
  if (spatial < 4 && temporal < 2) return 'Stable';
  if (spatial < 9 && temporal < 5) return 'Moderate variation';
  return 'Unstable / mixed colours';
}

/** Map a point in the displayed element (object-fit: cover) to video pixel coordinates. */
export function displayToVideo(dx: number, dy: number, cw: number, ch: number, vw: number, vh: number) {
  const scale = Math.max(cw / vw, ch / vh);
  const offX = (cw - vw * scale) / 2, offY = (ch - vh * scale) / 2;
  return { x: (dx - offX) / scale, y: (dy - offY) / scale, scale };
}

/** Ring sample (e.g. iris without pupil and catch-lights): radii as fractions of R. */
export function sampleAnnulus(data: Uint8ClampedArray, width: number, height: number, cx: number, cy: number, R: number, inner = 0.4, outer = 0.85): SampleResult | null {
  const px: { r: number; g: number; b: number; y: number }[] = [];
  const r0 = (inner * R) ** 2, r1 = (outer * R) ** 2;
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(height - 1, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(width - 1, Math.ceil(cx + R)); x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d < r0 || d > r1) continue;
      const i = (y * width + x) * 4;
      px.push({ r: data[i], g: data[i + 1], b: data[i + 2], y: 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] });
    }
  }
  if (px.length < 4) return null;
  px.sort((a, b) => a.y - b.y);
  // drop darkest 15% (lashes, limbal ring shadow) and brightest 20% (catch-lights)
  const kept = px.slice(Math.floor(px.length * 0.15), Math.ceil(px.length * 0.8));
  const med = (k: 'r' | 'g' | 'b') => { const a = kept.map((p) => p[k]).sort((x, y) => x - y); return a[a.length >> 1] / 255; };
  return { srgb: [med('r'), med('g'), med('b')], spread: 0, pixels: px.length, kept: kept.length };
}
