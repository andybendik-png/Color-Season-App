import { describe, it, expect } from 'vitest';
import { applyCorrection, IDENTITY_CORRECTION, bradfordMatrix, planckianXy, whiteBalanceMatrix, type CorrectionSettings } from '../engine/colourCorrection';
import { describeSrgb, hexToSrgb, mul3, type Vec3 } from '../engine/colourConversion';

const S = (o: Partial<CorrectionSettings>): CorrectionSettings => ({ ...IDENTITY_CORRECTION, ...o });
const lab = (v: Vec3) => describeSrgb(v).lab;

describe('colour correction pipeline', () => {
  it('identity settings leave the colour unchanged', () => {
    const v = hexToSrgb('#6D7F98');
    expect(applyCorrection(v, IDENTITY_CORRECTION).srgb).toEqual(v);
  });
  it('white balance matrix is identity at 0/0', () => {
    const m = whiteBalanceMatrix(0, 0);
    m.forEach((row, i) => row.forEach((x, j) => expect(Math.abs(x - (i === j ? 1 : 0))).toBeLessThan(1e-9)));
  });
  it('Bradford maps the source white exactly onto the destination white', () => {
    const src: Vec3 = [1.0985, 1, 0.3558], dst: Vec3 = [0.95047, 1, 1.08883];
    const out = mul3(bradfordMatrix(src, dst), src);
    out.forEach((c, i) => expect(Math.abs(c - dst[i])).toBeLessThan(1e-9));
  });
  it('Planckian locus approximation: 6504 K near D65 chromaticity', () => {
    const [x, y] = planckianXy(6504);
    expect(Math.abs(x - 0.3135)).toBeLessThan(0.002);
    expect(Math.abs(y - 0.3237)).toBeLessThan(0.002);
  });
  it('Warm slider increases b* of a neutral grey, Cool decreases it', () => {
    const g: Vec3 = [0.5, 0.5, 0.5];
    expect(lab(applyCorrection(g, S({ temperature: 40 })).srgb).b).toBeGreaterThan(3);
    expect(lab(applyCorrection(g, S({ temperature: -40 })).srgb).b).toBeLessThan(-3);
  });
  it('Magenta slider increases a* of a neutral grey, Green decreases it', () => {
    const g: Vec3 = [0.5, 0.5, 0.5];
    expect(lab(applyCorrection(g, S({ tint: 50 })).srgb).a).toBeGreaterThan(1);
    expect(lab(applyCorrection(g, S({ tint: -50 })).srgb).a).toBeLessThan(-1);
  });
  it('exposure +1 EV doubles linear light (grey stays neutral)', () => {
    const g: Vec3 = [0.4, 0.4, 0.4];
    const out = describeSrgb(applyCorrection(g, S({ exposure: 1 })).srgb);
    const inp = describeSrgb(g);
    expect(Math.abs(out.linear[1] / inp.linear[1] - 2)).toBeLessThan(0.02);
    expect(out.lch.C).toBeLessThan(0.5);
  });
  it('saturation scales chroma and preserves hue', () => {
    const v = hexToSrgb('#6D7F98');
    const a = describeSrgb(v), b = describeSrgb(applyCorrection(v, S({ saturation: -50 })).srgb);
    expect(Math.abs(b.oklch.C / a.oklch.C - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(b.oklch.h - a.oklch.h)).toBeLessThan(1.5);
  });
  it('contrast pushes lightness away from mid-grey', () => {
    const dark: Vec3 = [0.2, 0.2, 0.2], light: Vec3 = [0.85, 0.85, 0.85];
    expect(lab(applyCorrection(dark, S({ contrast: 30 })).srgb).L).toBeLessThan(lab(dark).L);
    expect(lab(applyCorrection(light, S({ contrast: 30 })).srgb).L).toBeGreaterThan(lab(light).L);
  });
  it('extreme settings stay in gamut and flag clipping', () => {
    const r = applyCorrection(hexToSrgb('#E0162B'), S({ saturation: 100, exposure: 1.5 }));
    r.srgb.forEach((c) => { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); });
    expect(r.clipped).toBe(true);
  });
  it('R gain only raises red', () => {
    const v: Vec3 = [0.4, 0.4, 0.4];
    const o = applyCorrection(v, S({ rGain: 20 })).srgb;
    expect(o[0]).toBeGreaterThan(0.4); expect(Math.abs(o[1] - 0.4)).toBeLessThan(0.002); expect(Math.abs(o[2] - 0.4)).toBeLessThan(0.002);
  });
});
