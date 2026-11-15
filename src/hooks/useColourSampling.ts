import { useEffect, useRef, useState } from 'react';
import { describeSrgb, type Vec3, type Lab } from '../engine/colourConversion';
import { sampleCircle, stabilityOf, temporalSpread, displayToVideo, type Stability } from '../engine/sampling';

export interface LiveSample { srgb: Vec3; spread: number; temporal: number; stability: Stability; pixels: number }

const INTERVAL_MS = 120; // ~8 samples/second: responsive without burning battery
const SAMPLE_CANVAS = 128; // max side of the downscaled sampling canvas

/**
 * Samples the circle at the centre of the displayed video. Coordinates are computed in the
 * video's own pixel space (videoWidth/videoHeight), accounting for object-fit: cover cropping,
 * not in CSS pixels.
 */
export function useColourSampling(video: HTMLVideoElement | null, active: boolean, radiusCss: number) {
  const [sample, setSample] = useState<LiveSample | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recent = useRef<{ srgb: Vec3; lab: Lab }[]>([]);

  useEffect(() => {
    if (!video || !active) return;
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' } as CanvasRenderingContext2DSettings);
    if (!ctx) return;
    let raf = 0, last = 0, stopped = false;
    recent.current = [];
    const tick = (t: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (t - last < INTERVAL_MS) return;
      last = t;
      const vw = video.videoWidth, vh = video.videoHeight;
      const cw = video.clientWidth, ch = video.clientHeight;
      if (!vw || !vh || !cw || !ch || video.readyState < 2) return;
      const c = displayToVideo(cw / 2, ch / 2, cw, ch, vw, vh);
      const rv = Math.max(2, radiusCss / c.scale);
      const sx = Math.max(0, c.x - rv), sy = Math.max(0, c.y - rv);
      const sw = Math.min(vw - sx, 2 * rv), sh = Math.min(vh - sy, 2 * rv);
      const dw = Math.max(4, Math.round(Math.min(sw, SAMPLE_CANVAS)));
      const dh = Math.max(4, Math.round((sh / sw) * dw));
      canvas.width = dw; canvas.height = dh;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
      const img = ctx.getImageData(0, 0, dw, dh);
      const r = sampleCircle(img.data, dw, dh, dw / 2, dh / 2, Math.min(dw, dh) / 2);
      if (!r) return;
      const lab = describeSrgb(r.srgb).lab;
      recent.current.push({ srgb: r.srgb, lab });
      if (recent.current.length > 6) recent.current.shift();
      // Output: per-channel median of the last 4 frames (suppresses flicker).
      const last4 = recent.current.slice(-4);
      const med = (i: number) => { const a = last4.map((x) => x.srgb[i]).sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
      const temporal = temporalSpread(recent.current.map((x) => x.lab));
      setSample({ srgb: [med(0), med(1), med(2)], spread: r.spread, temporal, stability: stabilityOf(r.spread, temporal), pixels: r.pixels });
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [video, active, radiusCss]);

  return sample;
}

/** Sample a point on a frozen frame canvas (colour-picker mode). */
export function samplePoint(canvas: HTMLCanvasElement, x: number, y: number, radius: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
  if (!ctx) return null;
  const r = Math.max(2, Math.round(radius));
  const x0 = Math.max(0, Math.round(x - r)), y0 = Math.max(0, Math.round(y - r));
  const w = Math.min(canvas.width - x0, 2 * r), h = Math.min(canvas.height - y0, 2 * r);
  if (w <= 0 || h <= 0) return null;
  const img = ctx.getImageData(x0, y0, w, h);
  return sampleCircle(img.data, w, h, x - x0, y - y0, r);
}
