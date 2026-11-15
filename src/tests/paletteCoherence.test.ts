import { describe, it, expect } from 'vitest';
import { SEASONS } from '../data/seasons';
import { REFERENCE_COLOURS } from '../data/database';
import { NEUTRAL_CATEGORIES } from '../data/types';

// Palette coherence audit: each season's chromatic colours should sit inside its declared
// attribute profile. This guards against arbitrary or mis-assigned reference colours.
describe('palette coherence', () => {
  for (const s of SEASONS) {
    it(`${s.name}: >= 50 colours, chromatic colours mostly inside profile`, () => {
      const cols = REFERENCE_COLOURS.filter((c) => c.subSeason === s.id);
      expect(cols.length).toBeGreaterThanOrEqual(50);
      const chromatic = cols.filter((c) => !NEUTRAL_CATEGORIES.includes(c.category));
      const out = chromatic.filter((c) => {
        const p = s.profile;
        const tol = { L: 3, C: 3 };
        return c.lab.L < p.lightness[0] - tol.L || c.lab.L > p.lightness[1] + tol.L
          || c.desc.lch.C > p.chromaMax + tol.C
          ;
      });
      if (out.length && (globalThis as { process?: { env: Record<string, string> } }).process?.env.AUDIT) {
        console.log(s.name, out.map((c) => `${c.name} ${c.hex} L${c.lab.L.toFixed(0)} C${c.desc.lch.C.toFixed(0)} U${c.undertone.toFixed(2)}`));
      }
      expect(out.length / chromatic.length).toBeLessThanOrEqual(0.1);
    });
  }
  it('warm seasons are warmer on average than their cool counterparts', () => {
    const meanU = (id: string) => {
      const c = REFERENCE_COLOURS.filter((x) => x.subSeason === id && !NEUTRAL_CATEGORIES.includes(x.category));
      return c.reduce((s, x) => s + x.undertone, 0) / c.length;
    };
    const pairs = [['soft-autumn', 'soft-summer'], ['light-spring', 'light-summer'], ['true-spring', 'true-summer'],
      ['true-autumn', 'true-winter'], ['deep-autumn', 'deep-winter'], ['bright-spring', 'bright-winter']];
    for (const [w, c] of pairs) expect(meanU(w)).toBeGreaterThan(meanU(c) + 0.15);
  });
  it('no duplicate hex within a season', () => {
    for (const s of SEASONS) {
      const hexes = REFERENCE_COLOURS.filter((c) => c.subSeason === s.id).map((c) => c.hex);
      expect(new Set(hexes).size).toBe(hexes.length);
    }
  });
});
