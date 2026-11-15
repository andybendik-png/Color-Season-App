import { describe, it, expect } from 'vitest';
import { analyseBrows, faceShapeOf, inside, makeFrame, yAt, LM, type Pt } from '../engine/brows';

/** Synthetic, symmetric, upright face (pixels). Iris radius 25 px → 11.7 mm / 50 px. */
function face(opts: { rollDeg?: number; tailExtra?: number; startShift?: number } = {}): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 500, y: 500 }));
  const set = (i: number, x: number, y: number) => { lm[i] = { x, y }; };
  for (const side of [-1, 1] as const) {
    const cx = 500 + side * 130, cy = 500;
    const iris = side < 0 ? LM.irisA : LM.irisB;
    set(iris[0], cx, cy);
    [[25, 0], [0, -25], [-25, 0], [0, 25]].forEach(([dx, dy], k) => set(iris[k + 1], cx + dx, cy + dy));
    set(side < 0 ? LM.eyeA_outer : LM.eyeB_outer, cx + side * 70, cy + 4);
    set(side < 0 ? LM.eyeA_inner : LM.eyeB_inner, cx - side * 70, cy + 4);
    set(side < 0 ? LM.alaA : LM.alaB, 500 + side * 55, 700);
    const upper = side < 0 ? LM.browA_upper : LM.browB_upper, lower = side < 0 ? LM.browA_lower : LM.browB_lower;
    // outer -> inner, brow from x = inner(500±50) to outer(500±230)
    const xs = [230 + (opts.tailExtra ?? 0), 185, 140, 95, 55 - (opts.startShift ?? 0)];
    const upY = [372, 352, 348, 356, 362], loY = [392, 382, 380, 386, 392];
    xs.forEach((x, k) => { set(upper[k], 500 + side * x, upY[k]); set(lower[k], 500 + side * x, loY[k]); });
  }
  set(LM.top, 500, 220); set(LM.chin, 500, 900);
  set(LM.cheek[0], 260, 600); set(LM.cheek[1], 740, 600);
  set(LM.jaw[0], 320, 820); set(LM.jaw[1], 680, 820);
  set(LM.forehead[0], 300, 330); set(LM.forehead[1], 700, 330);
  if (opts.rollDeg) {
    const a = (opts.rollDeg * Math.PI) / 180;
    return lm.map((p) => ({ x: 500 + (p.x - 500) * Math.cos(a) - (p.y - 500) * Math.sin(a), y: 500 + (p.x - 500) * Math.sin(a) + (p.y - 500) * Math.cos(a) }));
  }
  return lm;
}

describe('brow mapping', () => {
  it('frame round-trips points and removes roll', () => {
    const f = makeFrame({ x: 0, y: 0 }, { x: 10, y: 10 });
    const p = { x: 3, y: 7 };
    const q = f.toImage(f.toLocal(p));
    expect(q.x).toBeCloseTo(3, 9); expect(q.y).toBeCloseTo(7, 9);
    expect(f.toLocal({ x: 10, y: 10 }).y).toBeCloseTo(0, 9);
  });
  it('uses the iris (11.7 mm) for scale', () => {
    const a = analyseBrows(face());
    expect(a.mmPerPx).toBeCloseTo(11.7 / 50, 6);
  });
  it('guides follow the classic rules: start ≈ ala/inner corner, peak outside the limbus, tail on ala–canthus line', () => {
    const a = analyseBrows(face());
    for (const s of a.sides) {
      const o = s.outward;
      expect(o * (s.ideal.peak.x - s.guides.limbus.x)).toBeGreaterThanOrEqual(0);
      expect(o * (s.ideal.tail.x - s.ideal.peak.x)).toBeGreaterThan(0);
      expect(s.ideal.peak.y).toBeLessThan(s.ideal.start.y); // arch rises from the head
      // the suggested lower edge stays within realistic trimming limits of the real brow
      s.ideal.lower.forEach((p) => { const cur = yAt(s.current.lower, p.x); if (cur !== null) expect(Math.abs(p.y - cur) * a.mmPerPx).toBeLessThanOrEqual(2.5 + 1e-6); });
    }
  });
  it('is symmetric for a symmetric face and robust to head roll', () => {
    const a = analyseBrows(face()), b = analyseBrows(face({ rollDeg: 8 }));
    expect(a.sides[0].metrics.tailOffsetMm).toBeCloseTo(a.sides[1].metrics.tailOffsetMm, 6);
    expect(b.sides[0].metrics.tailOffsetMm).toBeCloseTo(a.sides[0].metrics.tailOffsetMm, 4);
  });
  it('detects an over-long tail and a start too close to the nose', () => {
    const a = analyseBrows(face({ tailExtra: 130, startShift: 40 }));
    const s = a.sides[0];
    expect(s.metrics.tailOffsetMm).toBeGreaterThan(2);
    expect(s.advice.join(' ')).toMatch(/trim|tweeze/i);
    expect(s.metrics.startOffsetMm).toBeLessThan(-1.5);
  });
  it('straight style has a lower arch than defined style', () => {
    const st = analyseBrows(face(), 'straight').sides[0], de = analyseBrows(face(), 'defined').sides[0];
    const lift = (s: typeof st) => s.ideal.start.y - s.ideal.peak.y;
    expect(lift(st)).toBeLessThan(lift(de));
  });
  it('face shape classification and geometry helpers', () => {
    expect(['Oval', 'Long', 'Round', 'Square', 'Heart']).toContain(faceShapeOf(face()).shape);
    expect(yAt([{ x: 0, y: 0 }, { x: 10, y: 10 }], 5)).toBe(5);
    expect(inside([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], { x: 5, y: 5 })).toBe(true);
    expect(() => analyseBrows([])).toThrow();
  });
});
