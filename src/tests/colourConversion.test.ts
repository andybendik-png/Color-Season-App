import { describe, it, expect } from 'vitest';
import {
  describeHex, hexToSrgb, srgbToHex, isValidHex, normaliseHex, srgbToLinear, linearToSrgb, linearRgbToXyz, xyzToLab, labToXyz,
  xyzToLinearRgb, linearRgbToOklab, oklabToLinearRgb, xyzToOklab, srgbToHsl, gamutMapOklch, D65_WHITE, inGamut, type Vec3,
} from '../engine/colourConversion';

const close = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe('sRGB transfer + XYZ (D65)', () => {
  it('white maps to the D65 white point', () => {
    const xyz = linearRgbToXyz(srgbToLinear([1, 1, 1]));
    D65_WHITE.forEach((w, i) => close(xyz[i], w, 1e-4));
  });
  it('sRGB red/green/blue primaries -> XYZ (Lindbloom reference)', () => {
    const r = linearRgbToXyz([1, 0, 0]), g = linearRgbToXyz([0, 1, 0]), b = linearRgbToXyz([0, 0, 1]);
    [0.4124564, 0.2126729, 0.0193339].forEach((v, i) => close(r[i], v, 1e-6));
    [0.3575761, 0.7151522, 0.119192].forEach((v, i) => close(g[i], v, 1e-6));
    [0.1804375, 0.072175, 0.9503041].forEach((v, i) => close(b[i], v, 1e-6));
  });
  it('transfer function round trip and breakpoint', () => {
    for (let i = 0; i <= 255; i++) close(linearToSrgb(srgbToLinear([i / 255, 0, 0]))[0], i / 255, 1e-9);
    close(srgbToLinear([0.04045, 0, 0])[0], 0.04045 / 12.92, 1e-9);
    close(srgbToLinear([0.5, 0, 0])[0], 0.214041, 1e-6);
  });
  it('XYZ <-> linear RGB round trip', () => {
    const v: Vec3 = [0.2, 0.5, 0.8];
    xyzToLinearRgb(linearRgbToXyz(v)).forEach((c, i) => close(c, v[i], 1e-6));
  });
});

describe('CIELAB (D65)', () => {
  const cases: [string, number, number, number][] = [
    ['#FFFFFF', 100, 0, 0],
    ['#000000', 0, 0, 0],
    ['#FF0000', 53.2408, 80.0925, 67.2032],
    ['#00FF00', 87.7347, -86.1827, 83.1793],
    ['#0000FF', 32.2970, 79.1875, -107.8602],
    ['#808080', 53.5850, 0, 0],
  ];
  for (const [hex, L, a, b] of cases) {
    it(`${hex} -> Lab(${L}, ${a}, ${b})`, () => {
      const lab = describeHex(hex).lab;
      close(lab.L, L, 0.01); close(lab.a, a, 0.01); close(lab.b, b, 0.01);
    });
  }
  it('Lab <-> XYZ round trip, including the low-L linear segment', () => {
    for (const xyz of [[0.3, 0.4, 0.5], [0.002, 0.003, 0.004], [0.9, 0.95, 1.0]] as Vec3[]) {
      labToXyz(xyzToLab(xyz)).forEach((c, i) => close(c, xyz[i], 1e-7));
    }
  });
});

describe('OKLab / OKLCH', () => {
  it("matches Ottosson's published XYZ -> OKLab reference values", () => {
    const ref: [Vec3, Vec3][] = [
      [[0.95, 1.0, 1.089], [1.0, 0.0, 0.0]],
      [[1, 0, 0], [0.45, 1.236, -0.019]],
      [[0, 1, 0], [0.922, -0.671, 0.263]],
      [[0, 0, 1], [0.153, -1.415, -0.449]],
    ];
    for (const [xyz, o] of ref) {
      const r = xyzToOklab(xyz);
      close(r.L, o[0], 0.002); close(r.a, o[1], 0.002); close(r.b, o[2], 0.002);
    }
  });
  it('sRGB red -> oklch(0.62796 0.25768 29.23) (CSS Color 4 reference)', () => {
    const c = describeHex('#FF0000').oklch;
    close(c.L, 0.62796, 1e-4); close(c.C, 0.25768, 1e-4); close(c.h, 29.2339, 0.01);
  });
  it('white -> L=1, C≈0; round trip OKLab -> linear', () => {
    const w = describeHex('#FFFFFF').oklch;
    close(w.L, 1, 1e-4); close(w.C, 0, 1e-4);
    const v: Vec3 = [0.1, 0.6, 0.3];
    oklabToLinearRgb(linearRgbToOklab(v)).forEach((c, i) => close(c, v[i], 1e-6));
  });
});

describe('HSL', () => {
  it('known values', () => {
    const h = srgbToHsl(hexToSrgb('#5F7590'));
    close(h.h, 213.06, 0.1); close(h.s, 20.5, 0.2); close(h.l, 46.9, 0.2);
    expect(srgbToHsl([0.5, 0.5, 0.5]).s).toBe(0);
  });
});

describe('HEX parsing', () => {
  it('accepts 3/6 digit, with or without #, any case', () => {
    expect(normaliseHex('fff')).toBe('#FFFFFF');
    expect(normaliseHex('#8e9196')).toBe('#8E9196');
    expect(srgbToHex(hexToSrgb('#123ABC'))).toBe('#123ABC');
  });
  it('rejects invalid input', () => {
    for (const bad of ['', '#12', '#1234', 'GGGGGG', '#12345G', 'rgb(1,2,3)', '#1234567']) {
      expect(isValidHex(bad)).toBe(false);
      expect(() => normaliseHex(bad)).toThrow();
    }
  });
});

describe('Clipping and gamut', () => {
  it('srgbToHex clamps out-of-range channels', () => {
    expect(srgbToHex([1.2, -0.1, 0.5])).toBe('#FF0080');
  });
  it('gamut mapping keeps hue and lightness and lands in gamut', () => {
    const { lin, clipped } = gamutMapOklch({ L: 0.7, C: 0.4, h: 150 });
    expect(clipped).toBe(true);
    expect(inGamut(lin)).toBe(true);
    const back = describeHex(srgbToHex(linearToSrgb(lin))).oklch;
    close(back.h, 150, 2); close(back.L, 0.7, 0.01);
  });
  it('in-gamut colours are not altered', () => {
    const { clipped } = gamutMapOklch(describeHex('#8E9196').oklch);
    expect(clipped).toBe(false);
  });
});
