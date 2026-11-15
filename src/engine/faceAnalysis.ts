/**
 * Personal colouring analysis from measured skin, hair and eye colours (Stage 2 for people).
 *
 * Model (documented heuristic, NOT validated against professional draping):
 *  1. Optional white-reference correction: Bradford chromatic adaptation from the measured
 *     white to D65 (removes the photo's colour cast; lightness is kept).
 *  2. Features in CIELAB: skin L*, C*, hue angle h_ab (red vs yellow balance; higher = yellower);
 *     hair L*, C*, h_ab; eye L*, C*; contrast = max − min L* across skin, hair, eyes (and brows).
 *  3. Three dimensions in [-1, 1]:
 *       temperature  T = 0.55·skin + 0.35·hair + 0.10·eyes   (+ warm, − cool)
 *       value        V = (weighted mean L* − 50) / 20         (+ light, − deep)
 *       clarity      Cl = 0.45·contrast + 0.35·eye chroma + 0.20·skin chroma (+ clear, − soft)
 *  4. Each sub-season is a prototype point in (T, V, Cl) built from its dominant and secondary
 *     characteristics. Distance is weighted Euclidean; the ranking is by distance.
 *  5. Confidence (Low / Moderate / Higher) from the margin between the top two seasons and
 *     photo-quality checks. Never presented as a probability.
 * Sources and rationale: claude/research-selfie-season-and-brows.md (project doc) and README.
 */
import { describeSrgb, labToXyz, xyzToLab, labToLch, D65_WHITE, type Lab, type Vec3 } from './colourConversion';
import { bradfordMatrix } from './colourCorrection';
import { mul3 } from './colourConversion';
import { SEASONS } from '../data/seasons';
import type { SubSeasonId } from '../data/types';

export interface FeatureSamples {
  skin: Vec3[];        // sRGB 0..1 samples (cheeks, forehead, chin)
  hair: Vec3[];
  eyes: Vec3[];
  brows?: Vec3[];
  white?: Vec3 | null; // optional white reference (paper, white shirt)
}

export interface FeatureColour { srgb: Vec3; hex: string; lab: Lab; C: number; h: number }
export type ContrastLevel = 'Low' | 'Low-medium' | 'Medium' | 'Medium-high' | 'High';
export type Trait = 'Light' | 'Deep' | 'Warm' | 'Cool' | 'Clear' | 'Soft';

export interface PersonalAnalysis {
  skin: FeatureColour; hair: FeatureColour; eyes: FeatureColour; brows?: FeatureColour;
  whiteCorrected: boolean;
  contrast: number; contrastLevel: ContrastLevel;
  skinHue: number; ita: number;
  dims: { temperature: number; value: number; clarity: number };
  dominant: Trait; secondary: Trait;
  ranking: { id: SubSeasonId; name: string; distance: number; score: number }[];
  confidence: 'Low' | 'Moderate' | 'Higher';
  warnings: string[];
  softSummerNote: string;
}

/** Season prototypes in (temperature, value, clarity). Dominant trait at ±0.8–0.9, secondary ±0.4. */
export const PROTOTYPES: Record<SubSeasonId, [number, number, number]> = {
  'light-spring': [0.4, 0.85, 0.2], 'true-spring': [0.9, 0.3, 0.4], 'bright-spring': [0.4, 0.2, 0.9],
  'light-summer': [-0.4, 0.85, -0.2], 'true-summer': [-0.9, 0.1, -0.3], 'soft-summer': [-0.4, 0.0, -0.85],
  'soft-autumn': [0.4, 0.0, -0.85], 'true-autumn': [0.9, -0.2, -0.2], 'deep-autumn': [0.4, -0.85, 0.0],
  'deep-winter': [-0.4, -0.85, 0.2], 'true-winter': [-0.9, -0.3, 0.5], 'bright-winter': [-0.4, -0.1, 0.9],
};
const DIM_WEIGHTS: [number, number, number] = [1.0, 0.9, 1.0];

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Per-channel median of several sRGB samples. */
export function medianSrgb(samples: Vec3[]): Vec3 {
  return [median(samples.map((s) => s[0])), median(samples.map((s) => s[1])), median(samples.map((s) => s[2]))];
}

/** Returns a function that removes the colour cast implied by a white reference (keeps L*). */
export function whiteCorrector(white: Vec3 | null | undefined) {
  if (!white) return (lab: Lab) => lab;
  const w = describeSrgb(white).xyz;
  if (w[1] < 0.15) return (lab: Lab) => lab; // too dark to be a usable white
  const src: Vec3 = [w[0] / w[1], 1, w[2] / w[1]];
  const m = bradfordMatrix(src, D65_WHITE);
  return (lab: Lab) => {
    const out = xyzToLab(mul3(m, labToXyz(lab)));
    return { L: lab.L, a: out.a, b: out.b };
  };
}

function feature(samples: Vec3[], fix: (l: Lab) => Lab): FeatureColour {
  const srgb = medianSrgb(samples);
  const d = describeSrgb(srgb);
  const lab = fix(d.lab);
  const lch = labToLch(lab);
  return { srgb, hex: d.hex, lab, C: lch.C, h: lch.h };
}

export function contrastLevel(c: number): ContrastLevel {
  if (c < 22) return 'Low';
  if (c < 32) return 'Low-medium';
  if (c < 45) return 'Medium';
  if (c < 58) return 'Medium-high';
  return 'High';
}

export function analysePerson(s: FeatureSamples): PersonalAnalysis {
  if (!s.skin.length || !s.hair.length || !s.eyes.length) throw new Error('Skin, hair and eye samples are all required');
  const fix = whiteCorrector(s.white);
  const skin = feature(s.skin, fix), hair = feature(s.hair, fix), eyes = feature(s.eyes, fix);
  const brows = s.brows?.length ? feature(s.brows, fix) : undefined;
  const warnings: string[] = [];

  // --- Temperature ---
  // Skin hue angle: typical skin ~45–70°. Higher (yellower) reads warmer; lower (pinker) cooler.
  const skinT = clamp((skin.h - 57) / 9);
  // Hair: golden/red hair is chromatic and yellow-red; ash hair has low chroma.
  const hairT = hair.C < 4 ? -0.4 : clamp(0.6 * ((hair.C - 10) / 10) + 0.4 * ((hair.h - 60) / 25));
  // Eyes: warm eyes (amber, golden brown, warm green) have higher chroma at yellow hues.
  const eyeT = eyes.C < 6 ? -0.3 : clamp((eyes.h - 70) / 40) * Math.min(1, eyes.C / 20);
  const temperature = clamp(0.55 * skinT + 0.35 * hairT + 0.1 * eyeT);

  // --- Value ---
  const meanL = 0.45 * hair.lab.L + 0.35 * skin.lab.L + 0.2 * eyes.lab.L;
  const value = clamp((meanL - 50) / 20);

  // --- Contrast and clarity ---
  const Ls = [skin.lab.L, hair.lab.L, eyes.lab.L, ...(brows ? [brows.lab.L] : [])];
  const contrast = Math.max(...Ls) - Math.min(...Ls);
  const clarity = clamp(0.45 * ((contrast - 38) / 18) + 0.35 * ((eyes.C - 14) / 10) + 0.2 * ((skin.C - 20) / 7));

  // --- Ranking ---
  const p: [number, number, number] = [temperature, value, clarity];
  const ranking = SEASONS.map((season) => {
    const q = PROTOTYPES[season.id];
    const d = Math.sqrt(q.reduce((acc, qi, i) => acc + DIM_WEIGHTS[i] * (p[i] - qi) ** 2, 0));
    return { id: season.id, name: season.name, distance: d, score: Math.round(100 * Math.exp(-d * 1.2)) };
  }).sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));

  // --- Traits ---
  const traits: { t: Trait; v: number }[] = [
    { t: (value >= 0 ? 'Light' : 'Deep') as Trait, v: Math.abs(value) },
    { t: (temperature >= 0 ? 'Warm' : 'Cool') as Trait, v: Math.abs(temperature) },
    { t: (clarity >= 0 ? 'Clear' : 'Soft') as Trait, v: Math.abs(clarity) },
  ].sort((a, b) => b.v - a.v);

  // --- Quality checks ---
  if (!s.white) warnings.push('No white reference: the photo\'s colour cast cannot be removed, so temperature is the least reliable dimension.');
  if (s.white) {
    const w = describeSrgb(s.white);
    if (w.lab.L < 70) warnings.push('The white reference is quite dark; exposure may be low.');
    if (Math.max(...s.white) > 0.995) warnings.push('The white reference is clipped (pure white), so the colour-cast correction is approximate.');
  }
  if (skin.lab.L > 88) warnings.push('Skin looks over-exposed; values may be washed out.');
  if (skin.lab.L < 25 && skin.lab.L < hair.lab.L) warnings.push('Skin reads darker than expected; check lighting or sample placement.');
  if (skin.C > 35) warnings.push('Skin chroma is unusually high: a warm lamp, coloured light, makeup or a filter may be affecting the photo.');
  if (Math.abs(skin.h - 57) > 25) warnings.push('Skin hue is outside the usual range; the light source is probably coloured.');
  const spread = (arr: Vec3[]) => arr.length < 2 ? 0 : Math.max(...arr.map((x) => Math.hypot(...(x.map((c, i) => c - medianSrgb(arr)[i]) as number[])))) * 100;
  if (spread(s.skin) > 15) warnings.push('Skin samples differ a lot (uneven lighting or shadows on one side).');

  const margin = ranking[1].distance - ranking[0].distance;
  let confidence: PersonalAnalysis['confidence'] = margin > 0.25 ? 'Higher' : margin > 0.1 ? 'Moderate' : 'Low';
  if (!s.white || warnings.length >= 3) confidence = confidence === 'Higher' ? 'Moderate' : 'Low';

  const ssRank = ranking.findIndex((r) => r.id === 'soft-summer') + 1;
  const softSummerNote = ssRank === 1
    ? 'This photo is consistent with Soft Summer.'
    : ssRank <= 3
      ? `Soft Summer is #${ssRank} for this photo, close to the top. Neighbouring seasons are hard to separate from a single photo.`
      : `Soft Summer is #${ssRank} for this photo. If you were draped as Soft Summer in person, trust that over a photo; check the lighting tips and try again.`;

  return {
    skin, hair, eyes, brows, whiteCorrected: !!s.white, contrast, contrastLevel: contrastLevel(contrast),
    skinHue: skin.h, ita: (Math.atan2(skin.lab.L - 50, skin.lab.b) * 180) / Math.PI,
    dims: { temperature, value, clarity }, dominant: traits[0].t, secondary: traits[1].t,
    ranking, confidence, warnings, softSummerNote,
  };
}

/** Combine photo dimensions with draping answers (each −1..1 or null if not tested). */
export function combineWithDraping(a: PersonalAnalysis, drape: { temperature: number | null; value: number | null; clarity: number | null }, drapeWeight = 0.6) {
  const mix = (photo: number, d: number | null) => (d === null ? photo : (1 - drapeWeight) * photo + drapeWeight * d);
  const p: [number, number, number] = [mix(a.dims.temperature, drape.temperature), mix(a.dims.value, drape.value), mix(a.dims.clarity, drape.clarity)];
  return SEASONS.map((season) => {
    const q = PROTOTYPES[season.id];
    const d = Math.sqrt(q.reduce((acc, qi, i) => acc + DIM_WEIGHTS[i] * (p[i] - qi) ** 2, 0));
    return { id: season.id, name: season.name, distance: d, score: Math.round(100 * Math.exp(-d * 1.2)) };
  }).sort((x, y) => x.distance - y.distance || x.id.localeCompare(y.id));
}
