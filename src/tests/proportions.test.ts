import { describe, it, expect } from 'vitest';
import { analyseProportions, detectEdges, initialLines, poseFromMatrix, mouthOpen, LM_P, type LineKey, type PixelFn } from '../engine/proportions';
import { styleTips, DEFAULT_PROFILE, type FaceProfile } from '../engine/faceStyling';
import { makeFrame, type Pt } from '../engine/brows';

/** Synthetic upright face: irises 64 px apart → ~0.18 mm/px with 10 px iris radius. */
function face(): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 300, y: 400 }));
  const set = (i: number, x: number, y: number) => { lm[i] = { x, y }; };
  for (const [c, cx] of [[LM_P.irisA, 268], [LM_P.irisB, 332]] as const) {
    set(c, cx, 300); [[10, 0], [0, -10], [-10, 0], [0, 10]].forEach(([dx, dy], k) => set(c + 1 + k, cx + dx, 300 + dy));
  }
  set(LM_P.exoA, 240, 300); set(LM_P.endoA, 290, 300); set(LM_P.endoB, 310, 300); set(LM_P.exoB, 360, 300);
  set(LM_P.contourA, 200, 300); set(LM_P.contourB, 400, 300);
  set(LM_P.glabella, 300, 280); set(LM_P.top, 300, 200); set(LM_P.subnasale, 300, 380);
  set(LM_P.stomionU, 300, 412); set(LM_P.stomionL, 300, 413); set(LM_P.menton, 300, 480);
  set(LM_P.alaA, 285, 375); set(LM_P.alaB, 315, 375); set(205, 270, 400);
  return lm;
}
/** Image: skin everywhere inside the face, hair above y=160, background outside x 210..390. */
const SKIN: [number, number, number] = [214, 180, 160], HAIR: [number, number, number] = [70, 55, 45], BG: [number, number, number] = [40, 120, 200];
const px = (hairY: number, beardTo?: number): PixelFn => (x, y) => {
  if (x < 0 || y < 0 || x >= 600 || y >= 800) return null;
  if (x < 210 || x > 390) return BG;
  if (y < hairY) return HAIR;
  if (beardTo && y > 470 && y < beardTo && x > 260 && x < 340) return HAIR;
  return SKIN;
};

describe('facial proportions', () => {
  it('pose from identity matrix is 0/0/0', () => {
    const p = poseFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(Math.abs(p.yaw) + Math.abs(p.pitch) + Math.abs(p.roll)).toBeLessThan(1e-9);
  });
  it('finds the perceived hairline, beard bottom and visible edges by colour', () => {
    const d = detectEdges(face(), px(160, 520));
    expect(d.hairlineFound).toBe(true);
    expect(Math.abs(d.hairline!.y - 160)).toBeLessThan(6);
    expect(d.beardFound).toBe(true);
    expect(Math.abs(d.chin!.y - 520)).toBeLessThan(8);
    expect(Math.abs(d.edgeL!.x - 210)).toBeLessThan(6);
    expect(Math.abs(d.edgeR!.x - 390)).toBeLessThan(6);
  });
  it('lines are in anatomical order in the levelled frame', () => {
    const lm = face();
    const lines = initialLines(lm, detectEdges(lm, px(160)));
    const f = makeFrame(lm[LM_P.irisA], lm[LM_P.irisB]);
    const y = (k: LineKey) => f.toLocal(lines[k]).y, x = (k: LineKey) => f.toLocal(lines[k]).x;
    expect(y('hairline')).toBeLessThan(y('glabella'));
    expect(y('glabella')).toBeLessThan(y('subnasale'));
    expect(y('subnasale')).toBeLessThan(y('stomion'));
    expect(y('stomion')).toBeLessThan(y('chin'));
    const order: LineKey[] = ['edgeL', 'exoL', 'endoL', 'endoR', 'exoR', 'edgeR'];
    for (let i = 1; i < order.length; i++) expect(x(order[i])).toBeGreaterThan(x(order[i - 1]));
  });
  it('computes thirds, flags a long forehead, and a fringe is the top tip', () => {
    const lm = face();
    const lines = initialLines(lm, detectEdges(lm, px(110))); // hairline far up → long upper third
    const r = analyseProportions(lm, lines, null, { hairlineEstimated: false });
    const [up, mid, low] = r.thirds;
    expect(up.mm).toBeGreaterThan(mid.mm);
    expect(Math.abs(up.share + mid.share + low.share - 1)).toBeLessThan(1e-9);
    expect(up.level).not.toBe('Balanced');
    const tips = styleTips(r, { ...DEFAULT_PROFILE, hairLength: 'medium' });
    expect(tips[0].balances).toBe('Long upper third');
    expect(tips[0].visual?.kind).toBe('fringe');
  });
  it('balanced thirds when hairline makes the three equal', () => {
    const lm = face(); // glabella 280, subnasale 380, chin 480 → equal at hairline 180
    const r = analyseProportions(lm, initialLines(lm, detectEdges(lm, px(180))), null, { hairlineEstimated: false });
    r.thirds.forEach((t) => expect(t.level).toBe('Balanced'));
  });
  it('mm scale comes from the iris (11.7 mm)', () => {
    const lm = face();
    const r = analyseProportions(lm, initialLines(lm, detectEdges(lm, px(180))), null, { hairlineEstimated: false });
    expect(r.mmPerPx).toBeCloseTo(11.7 / 20, 6);
    expect(r.eyeWidthMm).toBeCloseTo(50 * 11.7 / 20, 3);
  });
  it('eye spacing classification uses gap ÷ eye width', () => {
    const lm = face();
    const r = analyseProportions(lm, initialLines(lm, detectEdges(lm, px(180))), null, { hairlineEstimated: false });
    expect(r.spacing.ratio).toBeCloseTo(20 / 50, 6);
    expect(r.spacing.label).toBe('Close-set');
    expect(styleTips(r, DEFAULT_PROFILE).some((t) => t.balances === 'Close-set eyes')).toBe(true);
  });
  it('warns about pose and open mouth', () => {
    const lm = face(); lm[LM_P.stomionL] = { x: 300, y: 440 };
    expect(mouthOpen(lm)).toBe(true);
    const r = analyseProportions(lm, initialLines(lm, detectEdges(lm, px(180))), { yaw: 15, pitch: -12, roll: 0 }, { hairlineEstimated: true, mouthOpen: true });
    expect(r.warnings.length).toBe(4);
  });
});

describe('style tips respect the person', () => {
  const lm = face();
  const shortLower = { ...initialLines(lm, detectEdges(lm, px(180))) };
  shortLower.chin = { x: 300, y: 440 };
  const r = analyseProportions(lm, shortLower, null, { hairlineEstimated: false });
  const tips = (p: Partial<FaceProfile>) => styleTips(r, { ...DEFAULT_PROFILE, ...p });
  it('suggests a chin beard for a short lower third only if facial hair is possible', () => {
    expect(tips({ presentation: 'man', facialHair: 'stubble' }).some((t) => t.area === 'Facial hair')).toBe(true);
    expect(tips({ presentation: 'man', facialHair: 'cannot' }).some((t) => t.area === 'Facial hair')).toBe(false);
    expect(tips({ presentation: 'woman' }).some((t) => t.area === 'Facial hair')).toBe(false);
  });
  it('no glasses tips when glasses are off the table', () => {
    expect(tips({ glasses: 'no' }).some((t) => t.area === 'Glasses')).toBe(false);
    expect(tips({ glasses: 'yes' }).some((t) => t.area === 'Glasses')).toBe(true);
  });
  it('every tip names what it balances and its evidence type', () => {
    for (const t of tips({ presentation: 'man', facialHair: 'full', glasses: 'open' })) {
      expect(t.balances.length).toBeGreaterThan(2);
      expect(['Research-backed', 'Stylist convention', 'Optician convention']).toContain(t.evidence);
    }
  });
});
