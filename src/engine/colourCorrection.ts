/**
 * User-guided (subjective) colour correction pipeline.
 *
 * IMPORTANT: this is NOT objective calibration. Without a measured reference target the user
 * can only match the camera output to their own perception of the object, as seen next to a
 * phone screen that has its own white point and brightness. The pipeline is well-defined and
 * reversible so the raw measurement is never lost.
 *
 * Correction order (documented and fixed):
 *   1. Decode sRGB -> linear RGB (IEC 61966-2-1).
 *   2. Per-channel gains in linear RGB (fine adjustment of R, G, B).
 *   3. White balance as a chromatic adaptation in XYZ (Bradford / von Kries):
 *      the "Warm <-> Cool" slider moves the assumed scene white along the Planckian locus
 *      (in mired steps, Kim et al. 2002 approximation); the "Green <-> Magenta" slider moves it
 *      perpendicular to the locus (CIE 1960 v). The colour is adapted from that white to the
 *      reference white (6504 K on the locus), so at 0/0 the step is an exact identity.
 *   4. Exposure (brightness) as a linear-light multiplier 2^EV.
 *   5. Contrast around a mid-grey pivot on OKLab lightness.
 *   6. Saturation as a chroma scale in OKLCH (perceptual; preserves hue and lightness).
 *   7. Gamut mapping: reduce OKLCH chroma at constant L/h until in sRGB, then clamp.
 */
import {
  Vec3, inv3, matMul, mul3, srgbToLinear, linearToSrgb, linearRgbToXyz, xyzToLinearRgb,
  linearRgbToOklab, oklabToOklch, gamutMapOklch,
} from './colourConversion';

export interface CorrectionSettings {
  temperature: number; // -100..100, positive = warmer result
  tint: number;        // -100..100, positive = more magenta result
  exposure: number;    // EV, -2..2
  saturation: number;  // -100..100 (percent change of chroma)
  contrast: number;    // -100..100
  rGain: number;       // -50..50 percent
  gGain: number;
  bGain: number;
}

export const IDENTITY_CORRECTION: CorrectionSettings = {
  temperature: 0, tint: 0, exposure: 0, saturation: 0, contrast: 0, rGain: 0, gGain: 0, bGain: 0,
};

export function isIdentity(s: CorrectionSettings): boolean {
  return (Object.keys(IDENTITY_CORRECTION) as (keyof CorrectionSettings)[]).every((k) => Math.abs(s[k]) < 1e-9);
}

const BRADFORD = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const BRADFORD_INV = inv3(BRADFORD);
const REF_CCT = 6504;
const MIRED_PER_STEP = 1; // slider 100 = 100 mired shift
const TINT_PER_STEP = 0.0002; // slider 100 = 0.02 in CIE 1960 v

/** Planckian locus chromaticity (Kim et al. 2002 cubic spline), valid 1667 K..25000 K. */
export function planckianXy(T: number): [number, number] {
  const t = Math.min(25000, Math.max(1667, T));
  const x = t <= 4000
    ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
    : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  let y: number;
  if (t <= 2222) y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683;
  else if (t <= 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  else y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

function whiteXyz(cct: number, dv: number): Vec3 {
  const [x, y] = planckianXy(cct);
  const d = -2 * x + 12 * y + 3;
  const u = (4 * x) / d;
  const v = (6 * y) / d + dv;
  const den = 2 * u - 8 * v + 4;
  const x2 = (3 * u) / den, y2 = (2 * v) / den;
  return [x2 / y2, 1, (1 - x2 - y2) / y2];
}

/** Bradford chromatic adaptation matrix (XYZ -> XYZ) from source white to destination white. */
export function bradfordMatrix(src: Vec3, dst: Vec3): number[][] {
  const s = mul3(BRADFORD, src), d = mul3(BRADFORD, dst);
  const D = [[d[0] / s[0], 0, 0], [0, d[1] / s[1], 0], [0, 0, d[2] / s[2]]];
  return matMul(BRADFORD_INV, matMul(D, BRADFORD));
}

const catCache = new Map<string, number[][]>();
export function whiteBalanceMatrix(temperature: number, tint: number): number[][] {
  const key = `${temperature}|${tint}`;
  const hit = catCache.get(key);
  if (hit) return hit;
  const refMired = 1e6 / REF_CCT;
  // Warmer result => assume the scene white was cooler (higher CCT, lower mired).
  const srcMired = Math.max(40, refMired - temperature * MIRED_PER_STEP);
  // More magenta result => assume the scene white was greener (higher v).
  const src = whiteXyz(1e6 / srcMired, tint * TINT_PER_STEP);
  const ref = whiteXyz(REF_CCT, 0);
  const m = bradfordMatrix(src, ref);
  if (catCache.size > 500) catCache.clear();
  catCache.set(key, m);
  return m;
}

export interface CorrectionResult { srgb: Vec3; clipped: boolean }

export function applyCorrection(srgb: Vec3, s: CorrectionSettings): CorrectionResult {
  if (isIdentity(s)) return { srgb: [...srgb] as Vec3, clipped: false };
  // 1-2
  let lin = srgbToLinear(srgb);
  lin = [lin[0] * (1 + s.rGain / 100), lin[1] * (1 + s.gGain / 100), lin[2] * (1 + s.bGain / 100)];
  // 3
  if (s.temperature !== 0 || s.tint !== 0) {
    lin = xyzToLinearRgb(mul3(whiteBalanceMatrix(s.temperature, s.tint), linearRgbToXyz(lin)));
  }
  // 4
  const k = Math.pow(2, s.exposure);
  lin = [lin[0] * k, lin[1] * k, lin[2] * k];
  // 5-6 (perceptual space)
  const lch = oklabToOklch(linearRgbToOklab(lin.map((c) => Math.max(0, c)) as Vec3));
  const PIVOT = 0.57; // OKLab L of ~18% mid-grey
  lch.L = PIVOT + (lch.L - PIVOT) * (1 + s.contrast / 100);
  lch.C = Math.max(0, lch.C * (1 + s.saturation / 100));
  // 7
  const { lin: mapped, clipped } = gamutMapOklch(lch);
  return { srgb: linearToSrgb(mapped).map((c) => Math.min(1, Math.max(0, c))) as Vec3, clipped };
}

export const CORRECTION_ORDER = [
  'sRGB decode to linear light',
  'Per-channel R/G/B gains (linear)',
  'White balance: Bradford chromatic adaptation (Warm/Cool along Planckian locus, Green/Magenta perpendicular)',
  'Exposure: 2^EV multiplier (linear)',
  'Contrast around mid-grey (OKLab L)',
  'Saturation: chroma scale (OKLCH)',
  'Gamut mapping: chroma reduction at constant L and hue, then clamp',
];
