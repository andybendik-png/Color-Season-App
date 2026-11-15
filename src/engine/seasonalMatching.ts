/**
 * Stage 2: measured colour -> seasonal database. Pure computation, independent of the camera.
 * Deterministic: same input always gives the same output (no randomness, stable sort keys).
 */
import { describeHex, describeSrgb, type ColourDescription, type Vec3 } from './colourConversion';
import { deltaE2000 } from './deltaE';
import { attributesOf, type ColourAttributes } from './attributes';
import {
  HUE_WINDOW, clothingVerdict, fitLabel, knnDistance, matchLabel, rangeFit, rankingDistance, similarityIndex,
  type ClothingVerdict, type FitLabel, type MatchLabel,
} from './scoring';
import { REFERENCE_COLOURS, RELATIVE_TEMPERATURE, type ReferenceColour } from '../data/database';
import { SEASONS, PRIMARY_SEASON, type SeasonDefinition } from '../data/seasons';
import type { SeasonFamily } from '../data/types';

export interface NeighbourMatch { ref: ReferenceColour; deltaE: number }
export interface DimensionFit { score: number; label: FitLabel; detail: string; direction: -1 | 0 | 1 }
export interface SeasonFit { temperature: DimensionFit; chroma: DimensionFit; lightness: DimensionFit; overall: number; basis: string }
export interface SeasonResult {
  season: SeasonDefinition;
  distance: number;        // D, weighted 3-NN CIEDE2000
  rankingDistance: number; // R
  similarityIndex: number;
  match: MatchLabel;
  nearest: NeighbourMatch[];
  fit: SeasonFit;
}
export interface PrimaryAssessment {
  result: SeasonResult;
  headline: string;
  clothing: ClothingVerdict;
  reasons: string[];
  closestReference: NeighbourMatch;
  alternative: SeasonResult;
  rank: number;
}
export interface Analysis {
  colour: ColourDescription;
  attributes: ColourAttributes;
  ranking: SeasonResult[];
  best: SeasonResult;
  bestFamily: SeasonFamily;
  closestOverall: NeighbourMatch;
  primary: PrimaryAssessment;
}

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

function seasonFit(season: SeasonDefinition, refs: ReferenceColour[], a: ColourAttributes): SeasonFit {
  const nearNeutral = a.chroma < 8;
  const window = nearNeutral
    ? refs.filter((r) => r.desc.lch.C < 12)
    : refs.filter((r) => r.desc.lch.C >= 6 && angDiff(r.oklch.h, a.hue) <= HUE_WINDOW);
  const p = season.profile;
  const name = season.name;

  if (window.length < 2) {
    const c = rangeFit(a.chroma, 0, p.chromaMax, 12);
    const l = rangeFit(a.lightness, p.lightness[0], p.lightness[1], 12);
    const t = { score: 0.25, label: fitLabel(0.25), direction: 0 as const,
      detail: `${name} has no reference colours in this hue family.` };
    const chroma: DimensionFit = { score: c.score, label: fitLabel(c.score), direction: Math.sign(c.excess) as -1 | 0 | 1,
      detail: c.excess > 0 ? `Too vivid for ${name} (C* ${a.chroma.toFixed(0)} vs profile max ${p.chromaMax}).` : `Chroma within the ${name} profile.` };
    const lightness: DimensionFit = { score: l.score, label: fitLabel(l.score), direction: Math.sign(l.excess) as -1 | 0 | 1,
      detail: l.excess > 0 ? `Lighter than the ${name} profile.` : l.excess < 0 ? `Darker than the ${name} profile.` : `Lightness within the ${name} profile.` };
    return { temperature: t, chroma, lightness, overall: Math.min(t.score, c.score, l.score), basis: 'declared profile (no same-hue references)' };
  }

  const us = window.map((r) => r.undertone), cs = window.map((r) => r.desc.lch.C), ls = window.map((r) => r.lab.L);
  const t = rangeFit(a.undertone, Math.min(...us) - 0.08, Math.max(...us) + 0.08, 0.35);
  const c = rangeFit(a.chroma, Math.min(...cs) - 3, Math.max(...cs) + 3, 12);
  const l = rangeFit(a.lightness, Math.min(...ls) - 3, Math.max(...ls) + 3, 9);
  const group = nearNeutral ? 'near-neutral colours' : 'colours of this hue';
  const temperature: DimensionFit = { score: t.score, label: fitLabel(t.score), direction: Math.sign(t.excess) as -1 | 0 | 1,
    detail: t.excess > 0 ? `Warmer than ${name}'s ${group}.` : t.excess < 0 ? `Cooler than ${name}'s ${group}.` : `Temperature in line with ${name}'s ${group}.` };
  const chroma: DimensionFit = { score: c.score, label: fitLabel(c.score), direction: Math.sign(c.excess) as -1 | 0 | 1,
    detail: c.excess > 0 ? `More vivid than ${name}'s ${group} (C* ${a.chroma.toFixed(0)} vs max ${Math.max(...cs).toFixed(0)}).`
      : c.excess < 0 ? `More muted than ${name}'s ${group} (C* ${a.chroma.toFixed(0)} vs min ${Math.min(...cs).toFixed(0)}).`
      : `Chroma in line with ${name}'s ${group}.` };
  const lightness: DimensionFit = { score: l.score, label: fitLabel(l.score), direction: Math.sign(l.excess) as -1 | 0 | 1,
    detail: l.excess > 0 ? `Lighter than ${name}'s ${group} (L* ${a.lightness.toFixed(0)} vs max ${Math.max(...ls).toFixed(0)}).`
      : l.excess < 0 ? `Darker than ${name}'s ${group} (L* ${a.lightness.toFixed(0)} vs min ${Math.min(...ls).toFixed(0)}).`
      : `Lightness in line with ${name}'s ${group}.` };
  return { temperature, chroma, lightness, overall: Math.min(t.score, c.score, l.score), basis: `${window.length} ${group}` };
}

const REFS_BY_SEASON = new Map(SEASONS.map((s) => [s.id, REFERENCE_COLOURS.filter((r) => r.subSeason === s.id)]));

export function analyseColour(colour: ColourDescription, primaryId = PRIMARY_SEASON): Analysis {
  const attributes = attributesOf(colour, RELATIVE_TEMPERATURE);
  let closestOverall: NeighbourMatch | null = null;
  const results: SeasonResult[] = SEASONS.map((season) => {
    const refs = REFS_BY_SEASON.get(season.id)!;
    const matches = refs.map((ref) => ({ ref, deltaE: deltaE2000(colour.lab, ref.lab) }))
      .sort((x, y) => x.deltaE - y.deltaE || x.ref.id.localeCompare(y.ref.id));
    if (!closestOverall || matches[0].deltaE < closestOverall.deltaE) closestOverall = matches[0];
    const D = knnDistance(matches.map((m) => m.deltaE));
    const fit = seasonFit(season, refs, attributes);
    const R = rankingDistance(D, fit.overall);
    return { season, distance: D, rankingDistance: R, similarityIndex: similarityIndex(R), match: matchLabel(D, fit.overall), nearest: matches.slice(0, 5), fit };
  });
  const ranking = [...results].sort((a, b) => a.rankingDistance - b.rankingDistance || a.season.id.localeCompare(b.season.id));
  const best = ranking[0];
  const famDist = new Map<SeasonFamily, number>();
  for (const r of ranking) famDist.set(r.season.family, Math.min(famDist.get(r.season.family) ?? Infinity, r.rankingDistance));
  const bestFamily = [...famDist.entries()].sort((a, b) => a[1] - b[1])[0][0];

  const p = results.find((r) => r.season.id === primaryId)!;
  const alternative = ranking.find((r) => r.season.id !== primaryId)!;
  const rank = ranking.indexOf(p) + 1;
  const reasons: string[] = [];
  const f = p.fit;
  for (const d of [f.temperature, f.chroma, f.lightness]) if (d.score < 0.9) reasons.push(d.detail);
  if (!reasons.length) reasons.push(`Temperature, chroma and lightness all sit within ${p.season.name}'s own colours of this type.`);
  reasons.push(`Nearest ${p.season.name} reference: ${p.nearest[0].ref.name} (ΔE00 ${p.nearest[0].deltaE.toFixed(1)}).`);
  if (alternative.rankingDistance + 1 < p.rankingDistance) {
    reasons.push(`${alternative.season.name} is a closer fit overall (ΔE00 ${alternative.distance.toFixed(1)} vs ${p.distance.toFixed(1)}).`);
  }
  let headline: string;
  switch (p.match) {
    case 'Strong match': headline = `Excellent ${p.season.name} match.`; break;
    case 'Good match': headline = `Good ${p.season.name} match.`; break;
    case 'Possible match': headline = `Possible ${p.season.name} match — borderline.`; break;
    default: headline = `Not ${p.season.name}. Closest match: ${best.season.id === primaryId ? alternative.season.name : best.season.name}.`;
  }
  return {
    colour, attributes, ranking, best, bestFamily, closestOverall: closestOverall!,
    primary: { result: p, headline, clothing: clothingVerdict(p.match), reasons, closestReference: p.nearest[0], alternative, rank },
  };
}

export const analyseHex = (hex: string) => analyseColour(describeHex(hex));
export const analyseSrgb = (srgb: Vec3) => analyseColour(describeSrgb(srgb));
