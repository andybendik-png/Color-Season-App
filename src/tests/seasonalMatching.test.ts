import { describe, it, expect } from 'vitest';
import { analyseHex } from '../engine/seasonalMatching';
import { REFERENCE_COLOURS } from '../data/database';
import { SEASONS } from '../data/seasons';

describe('seasonal matching', () => {
  it('is deterministic', () => {
    const a = analyseHex('#7D8A9A'), b = analyseHex('#7D8A9A');
    expect(a.ranking.map((r) => [r.season.id, r.rankingDistance])).toEqual(b.ranking.map((r) => [r.season.id, r.rankingDistance]));
    expect(a.primary.headline).toBe(b.primary.headline);
  });
  it('ranks all 12 sub-seasons', () => {
    const a = analyseHex('#123456');
    expect(a.ranking).toHaveLength(12);
    expect(new Set(a.ranking.map((r) => r.season.id)).size).toBe(12);
  });
  it('an exact Soft Summer reference colour is a strong Soft Summer match', () => {
    for (const hex of ['#6D7F98', '#9BA897', '#C2939B', '#9D8697', '#4F6B67']) {
      const a = analyseHex(hex);
      expect(a.primary.result.match).toMatch(/Strong|Good/);
      expect(a.primary.closestReference.deltaE).toBe(0);
    }
  });
  it('every reference colour has its own season in the top 3 for the large majority of entries', () => {
    let ok = 0;
    for (const ref of REFERENCE_COLOURS) {
      const a = analyseHex(ref.hex);
      if (a.ranking.slice(0, 3).some((r) => r.season.id === ref.subSeason)) ok++;
    }
    expect(ok / REFERENCE_COLOURS.length).toBeGreaterThan(0.85);
  });
  it('cool but too vivid is rejected for Soft Summer on chroma, not temperature', () => {
    const a = analyseHex('#1E4FB5'); // True Winter true blue
    expect(a.primary.result.match).toMatch(/Weak|Poor/);
    expect(a.primary.result.fit.chroma.label).toBe('Poor');
    expect(a.primary.result.fit.chroma.direction).toBe(1);
  });
  it('muted but too warm is rejected for Soft Summer, and points to Soft Autumn', () => {
    const a = analyseHex('#9A6B52'); // Soft Autumn muted cinnamon
    expect(a.primary.result.match).not.toMatch(/Strong|Good/);
    expect(a.primary.alternative.season.family).toBe('Autumn');
  });
  it('vivid warm colours are classified as warm seasons', () => {
    expect(['Spring', 'Autumn']).toContain(analyseHex('#E5452F').best.season.family); // tomato
    expect(['Spring', 'Autumn']).toContain(analyseHex('#F5C230').best.season.family); // golden yellow
  });
  it('closest overall reference is truly the minimum ΔE across the database', () => {
    const a = analyseHex('#8A7F99');
    const min = Math.min(...a.ranking.flatMap((r) => r.nearest.map((n) => n.deltaE)));
    expect(a.closestOverall.deltaE).toBeCloseTo(min, 10);
  });
  it('similarity index is monotonic in ranking distance and bounded 0..100', () => {
    const a = analyseHex('#5E7C96');
    for (let i = 1; i < a.ranking.length; i++) expect(a.ranking[i].similarityIndex).toBeLessThanOrEqual(a.ranking[i - 1].similarityIndex);
    a.ranking.forEach((r) => { expect(r.similarityIndex).toBeGreaterThanOrEqual(0); expect(r.similarityIndex).toBeLessThanOrEqual(100); });
  });
  it('edge cases: black, white, mid grey do not throw and return labels', () => {
    for (const hex of ['#000000', '#FFFFFF', '#808080']) {
      const a = analyseHex(hex);
      expect(a.primary.headline.length).toBeGreaterThan(5);
      expect(Number.isFinite(a.best.distance)).toBe(true);
    }
  });
  it('database has >= 50 colours per sub-season and full metadata', () => {
    for (const s of SEASONS) expect(REFERENCE_COLOURS.filter((c) => c.subSeason === s.id).length).toBeGreaterThanOrEqual(50);
    for (const c of REFERENCE_COLOURS) {
      expect(c.id && c.name && c.hex && c.category && c.temperature && c.chroma && c.lightness && c.source && c.quality).toBeTruthy();
    }
  });
});
