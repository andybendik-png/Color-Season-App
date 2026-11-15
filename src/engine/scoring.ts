/**
 * Scoring system (documented; deliberately NOT probabilities).
 *
 * 1. Palette distance D(season): CIEDE2000 from the sample to each reference colour of the season;
 *    the 3 nearest are combined with weights 0.5 / 0.3 / 0.2. Using several neighbours makes the
 *    result robust to a single lucky reference, and ignoring far colours stops unrelated parts of
 *    the palette from distorting it.
 * 2. Dimension fit (0..1) for temperature, chroma and lightness, judged against the season's own
 *    reference colours of similar hue (OKLCH hue within ±25°; for near-neutral samples, the
 *    season's near-neutral colours). Inside the observed range = 1, then a linear fall-off.
 *    Lightness fall-off is 9 L* units; temperature 0.35 undertone units; chroma 12 C* units.
 *    Overall fit = the weakest dimension (a colour that is cool but too vivid must not pass).
 * 3. Ranking distance R = D + 5 × (1 − fit).
 * 4. Similarity index = round(100 × exp(−R / 8)). An algorithmic score for comparison only.
 * 5. Match label from D and fit: Strong D≤4 & fit≥0.7; Good D≤7 & fit≥0.6; Possible D≤11 & fit≥0.3;
 *    Weak D≤16; otherwise Poor.
 * 6. Displayed temperature labels are relative to similar hues (see attributes.ts).
 */
export type MatchLabel = 'Strong match' | 'Good match' | 'Possible match' | 'Weak match' | 'Poor match';
export type FitLabel = 'Excellent' | 'Good' | 'Fair' | 'Poor';
export type ClothingVerdict = 'Excellent for Soft Summer' | 'Suitable' | 'Borderline' | 'Not recommended';

export const KNN_WEIGHTS = [0.5, 0.3, 0.2];
export const FIT_PENALTY = 5;
export const HUE_WINDOW = 25;

export function knnDistance(sortedDistances: number[]): number {
  let s = 0, w = 0;
  for (let i = 0; i < KNN_WEIGHTS.length && i < sortedDistances.length; i++) {
    s += sortedDistances[i] * KNN_WEIGHTS[i];
    w += KNN_WEIGHTS[i];
  }
  return w ? s / w : Infinity;
}

export const rankingDistance = (D: number, fit: number) => D + FIT_PENALTY * (1 - fit);
export const similarityIndex = (R: number) => Math.round(100 * Math.exp(-R / 8));

export function matchLabel(D: number, fit: number): MatchLabel {
  if (D <= 4 && fit >= 0.7) return 'Strong match';
  if (D <= 7 && fit >= 0.6) return 'Good match';
  if (D <= 11 && fit >= 0.3) return 'Possible match';
  if (D <= 16) return 'Weak match';
  return 'Poor match';
}

export function fitLabel(score: number): FitLabel {
  if (score >= 0.9) return 'Excellent';
  if (score >= 0.7) return 'Good';
  if (score >= 0.45) return 'Fair';
  return 'Poor';
}

export function clothingVerdict(label: MatchLabel): ClothingVerdict {
  switch (label) {
    case 'Strong match': return 'Excellent for Soft Summer';
    case 'Good match': return 'Suitable';
    case 'Possible match': return 'Borderline';
    default: return 'Not recommended';
  }
}

/** 1 inside [lo, hi], linear fall-off to 0 over `falloff` beyond either end. */
export function rangeFit(x: number, lo: number, hi: number, falloff: number): { score: number; excess: number } {
  const excess = x < lo ? x - lo : x > hi ? x - hi : 0;
  return { score: Math.max(0, 1 - Math.abs(excess) / falloff), excess };
}
