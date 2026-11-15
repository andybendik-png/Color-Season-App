/**
 * Colour-space conversions. All formulas are standard and documented:
 *  - sRGB transfer function: IEC 61966-2-1.
 *  - sRGB <-> XYZ (D65) matrices: Bruce Lindbloom (derived from sRGB primaries, D65 white).
 *  - CIELAB (D65 reference white): CIE 15:2004, with the exact CIE epsilon/kappa constants.
 *  - OKLab / OKLCH: Björn Ottosson (2020), "A perceptual color space for image processing".
 *
 * Conventions: sRGB and linear RGB channels in [0, 1]. XYZ with Y in [0, 1].
 * Lab L* in [0, 100]. OKLab L in [0, 1]. Hues in degrees [0, 360).
 */

export type Vec3 = [number, number, number];
export interface RGB { r: number; g: number; b: number } // 0..255 integers for display
export interface Lab { L: number; a: number; b: number }
export interface LCh { L: number; C: number; h: number }
export interface HSL { h: number; s: number; l: number } // h deg, s/l 0..100

export const D65_WHITE: Vec3 = [0.95047, 1.0, 1.08883];

export const M_SRGB_TO_XYZ: number[][] = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
export const M_XYZ_TO_SRGB: number[][] = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

export function mul3(m: number[][], v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function matMul(a: number[][], b: number[][]): number[][] {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}

export function inv3(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Singular matrix');
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// ---------- sRGB transfer ----------
export function srgbToLinearChannel(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgbChannel(c: number): number {
  const s = Math.sign(c), a = Math.abs(c);
  return s * (a <= 0.0031308 ? 12.92 * a : 1.055 * Math.pow(a, 1 / 2.4) - 0.055);
}
export const srgbToLinear = (v: Vec3): Vec3 => [srgbToLinearChannel(v[0]), srgbToLinearChannel(v[1]), srgbToLinearChannel(v[2])];
export const linearToSrgb = (v: Vec3): Vec3 => [linearToSrgbChannel(v[0]), linearToSrgbChannel(v[1]), linearToSrgbChannel(v[2])];

// ---------- XYZ ----------
export const linearRgbToXyz = (v: Vec3): Vec3 => mul3(M_SRGB_TO_XYZ, v);
export const xyzToLinearRgb = (v: Vec3): Vec3 => mul3(M_XYZ_TO_SRGB, v);

// ---------- CIELAB ----------
const EPS = 216 / 24389; // 0.008856
const KAPPA = 24389 / 27; // 903.3
export function xyzToLab(xyz: Vec3, white: Vec3 = D65_WHITE): Lab {
  const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(xyz[0] / white[0]), fy = f(xyz[1] / white[1]), fz = f(xyz[2] / white[2]);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
export function labToXyz(lab: Lab, white: Vec3 = D65_WHITE): Vec3 {
  const fy = (lab.L + 16) / 116, fx = fy + lab.a / 500, fz = fy - lab.b / 200;
  const inv = (t: number) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);
  const yr = lab.L > KAPPA * EPS ? fy ** 3 : lab.L / KAPPA;
  return [inv(fx) * white[0], yr * white[1], inv(fz) * white[2]];
}
export function labToLch(lab: Lab): LCh {
  const C = Math.hypot(lab.a, lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

// ---------- OKLab / OKLCH ----------
export function linearRgbToOklab(v: Vec3): Lab {
  const l = Math.cbrt(0.4122214708 * v[0] + 0.5363325363 * v[1] + 0.0514459929 * v[2]);
  const m = Math.cbrt(0.2119034982 * v[0] + 0.6806995451 * v[1] + 0.1073969566 * v[2]);
  const s = Math.cbrt(0.0883024619 * v[0] + 0.2817188376 * v[1] + 0.6299787005 * v[2]);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}
export function oklabToLinearRgb(o: Lab): Vec3 {
  const l = (o.L + 0.3963377774 * o.a + 0.2158037573 * o.b) ** 3;
  const m = (o.L - 0.1055613458 * o.a - 0.0638541728 * o.b) ** 3;
  const s = (o.L - 0.0894841775 * o.a - 1.291485548 * o.b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
/** Ottosson's XYZ (D65) -> OKLab path, used to verify against his published reference values. */
export function xyzToOklab(xyz: Vec3): Lab {
  const M1 = [
    [0.8189330101, 0.3618667424, -0.1288597137],
    [0.0329845436, 0.9293118715, 0.0361456387],
    [0.0482003018, 0.2643662691, 0.633851707],
  ];
  const lms = mul3(M1, xyz).map(Math.cbrt) as Vec3;
  return {
    L: 0.2104542553 * lms[0] + 0.793617785 * lms[1] - 0.0040720468 * lms[2],
    a: 1.9779984951 * lms[0] - 2.428592205 * lms[1] + 0.4505937099 * lms[2],
    b: 0.0259040371 * lms[0] + 0.7827717662 * lms[1] - 0.808675766 * lms[2],
  };
}
export const oklabToOklch = labToLch; // same polar transform
export function oklchToOklab(c: LCh): Lab {
  const r = (c.h * Math.PI) / 180;
  return { L: c.L, a: c.C * Math.cos(r), b: c.C * Math.sin(r) };
}

// ---------- HSL ----------
export function srgbToHsl(v: Vec3): HSL {
  const [r, g, b] = v;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d > 1e-9) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

// ---------- HEX ----------
const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
export function isValidHex(hex: string): boolean {
  return HEX_RE.test(hex.trim());
}
export function normaliseHex(hex: string): string {
  const m = hex.trim().match(HEX_RE);
  if (!m) throw new Error(`Invalid HEX colour: "${hex}"`);
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return '#' + h.toUpperCase();
}
export function hexToSrgb(hex: string): Vec3 {
  const h = normaliseHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export function srgbToHex(v: Vec3): string {
  return '#' + v.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function srgbToRgb255(v: Vec3): RGB {
  return { r: Math.round(clamp01(v[0]) * 255), g: Math.round(clamp01(v[1]) * 255), b: Math.round(clamp01(v[2]) * 255) };
}

// ---------- Gamut ----------
export function inGamut(lin: Vec3, tol = 1e-5): boolean {
  return lin.every((c) => c >= -tol && c <= 1 + tol);
}
/**
 * Map an OKLCH colour into the sRGB gamut by reducing chroma at constant L and hue
 * (bisection), then clamping any residual. This avoids hue shifts caused by naive clipping.
 */
export function gamutMapOklch(c: LCh): { lin: Vec3; clipped: boolean } {
  const L = Math.min(1, Math.max(0, c.L));
  let lin = oklabToLinearRgb(oklchToOklab({ ...c, L }));
  if (inGamut(lin)) return { lin, clipped: false };
  let lo = 0, hi = c.C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinearRgb(oklchToOklab({ L, C: mid, h: c.h })))) lo = mid; else hi = mid;
  }
  lin = oklabToLinearRgb(oklchToOklab({ L, C: lo, h: c.h })).map(clamp01) as Vec3;
  return { lin, clipped: true };
}

// ---------- Full description ----------
export interface ColourDescription {
  hex: string;
  srgb: Vec3;
  rgb: RGB;
  linear: Vec3;
  xyz: Vec3;
  lab: Lab;
  lch: LCh;
  oklab: Lab;
  oklch: LCh;
  hsl: HSL;
}
export function describeSrgb(srgb: Vec3): ColourDescription {
  const s = srgb.map(clamp01) as Vec3;
  const linear = srgbToLinear(s);
  const xyz = linearRgbToXyz(linear);
  const lab = xyzToLab(xyz);
  const oklab = linearRgbToOklab(linear);
  return {
    hex: srgbToHex(s), srgb: s, rgb: srgbToRgb255(s), linear, xyz, lab,
    lch: labToLch(lab), oklab, oklch: oklabToOklch(oklab), hsl: srgbToHsl(s),
  };
}
export const describeHex = (hex: string) => describeSrgb(hexToSrgb(hex));
