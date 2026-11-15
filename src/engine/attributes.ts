/**
 * Colour characteristics: lightness, chroma, hue and warm/cool tendency (undertone).
 *
 * Undertone index (absolute, documented):
 *   u_hue  = cos(h_oklch - 70°)          warm pole at golden orange, cool pole at blue (~250°)
 *   u_axis = clamp((b* - 0.35 a*) / 8)    CIELAB yellow-blue / red-green balance for near-neutrals
 *   w      = clamp((C*ab - 3) / 12, 0, 1)
 *   u      = w * u_hue + (1 - w) * u_axis * min(1, C*ab / 3 + 0.2)
 *
 * This is the literal "yellow versus blue undertone" reading, so every blue is cool in absolute
 * terms. Seasonal temperature *compatibility* is therefore judged relative to a season's own
 * reference colours of similar hue (see seasonalMatching.ts), which is how a "warm blue"
 * (turquoise-leaning) is distinguished from a "cool blue".
 *
 * Earlier data-driven variants (hue position between warm/cool season means; warm-vs-cool
 * nearest-neighbour resemblance) were tested and rejected as unstable; see README.
 * This is a heuristic model of a subjective classification system, not a physical quantity.
 */
import type { ColourDescription } from './colourConversion';

export type TemperatureClass = 'Warm' | 'Warm-neutral' | 'Neutral' | 'Cool-neutral' | 'Cool';
export type ChromaClass = 'Very muted' | 'Muted' | 'Moderate' | 'Clear' | 'Vivid';
export type LightnessClass = 'Deep' | 'Medium-deep' | 'Medium' | 'Light-medium' | 'Light';

export function undertoneOf(c: ColourDescription): number {
  const uHue = Math.cos(((c.oklch.h - 70) * Math.PI) / 180);
  const { a, b } = c.lab;
  const uAxis = Math.max(-1, Math.min(1, (b - 0.35 * a) / 8));
  const C = c.lch.C;
  const w = Math.max(0, Math.min(1, (C - 3) / 12));
  return w * uHue + (1 - w) * uAxis * Math.min(1, C / 3 + 0.2);
}

/**
 * Displayed temperature is RELATIVE to similar colours, because seasonal language is relative
 * ("a cool red" is a blue-red, although every red has a yellow-leaning absolute hue).
 *
 *   rel_hue = 2 × (kernel-weighted share of warm-season references) − 1
 *
 * computed over all chromatic references (C*ab ≥ 8) with Gaussian weights on OKLCH hue
 * difference (σ = 10°), chroma difference (σ = 12) and lightness difference (σ = 25).
 * For near-neutral samples the absolute yellow–blue undertone is used; between C*ab 6 and 12
 * the two are blended. Result in [-1, 1]; +1 = resembles warm-season colours of this kind.
 */
export interface TemperatureRef { h: number; C: number; L: number; warm: boolean }
export function makeRelativeTemperature(refs: TemperatureRef[]) {
  const chromatic = refs.filter((r) => r.C >= 8);
  return (u: number, h: number, C: number, L: number): number => {
    let ww = 0, wt = 0;
    for (const r of chromatic) {
      const dh = Math.abs(((r.h - h + 540) % 360) - 180);
      if (dh > 35) continue;
      const w = Math.exp(-0.5 * ((dh / 10) ** 2 + ((r.C - C) / 12) ** 2 + ((r.L - L) / 25) ** 2));
      wt += w;
      if (r.warm) ww += w;
    }
    const relHue = wt > 0.05 ? 2 * (ww / wt) - 1 : u;
    const k = Math.max(0, Math.min(1, (C - 6) / 6));
    return Math.max(-1, Math.min(1, k * relHue + (1 - k) * u));
  };
}

export function temperatureClass(u: number): TemperatureClass {
  if (u > 0.55) return 'Warm';
  if (u > 0.2) return 'Warm-neutral';
  if (u >= -0.2) return 'Neutral';
  if (u >= -0.55) return 'Cool-neutral';
  return 'Cool';
}

/** Chroma classes on CIELAB C*ab. */
export function chromaClass(labC: number): ChromaClass {
  if (labC < 12) return 'Very muted';
  if (labC < 25) return 'Muted';
  if (labC < 40) return 'Moderate';
  if (labC < 60) return 'Clear';
  return 'Vivid';
}

/** Lightness classes on CIELAB L*. */
export function lightnessClass(L: number): LightnessClass {
  if (L < 30) return 'Deep';
  if (L < 45) return 'Medium-deep';
  if (L < 62) return 'Medium';
  if (L < 77) return 'Light-medium';
  return 'Light';
}

export interface ColourAttributes {
  lightness: number; // CIELAB L*
  chroma: number;    // CIELAB C*ab
  hue: number;       // OKLCH hue
  undertone: number; // absolute undertone index -1..1 (used for season comparisons)
  relativeTemperature: number; // -1..1 relative to similar hues (used for the displayed label)
  temperature: TemperatureClass;
  chromaClass: ChromaClass;
  lightnessClass: LightnessClass;
  muted: boolean;
}

export function attributesOf(c: ColourDescription, relative?: (u: number, h: number, C: number, L: number) => number): ColourAttributes {
  const u = undertoneOf(c);
  const rel = relative ? relative(u, c.oklch.h, c.lch.C, c.lab.L) : u;
  return {
    lightness: c.lab.L, chroma: c.lch.C, hue: c.oklch.h, undertone: u, relativeTemperature: rel,
    temperature: temperatureClass(rel), chromaClass: chromaClass(c.lch.C),
    lightnessClass: lightnessClass(c.lab.L), muted: c.lch.C < 25,
  };
}
