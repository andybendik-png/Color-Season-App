import { describe, it, expect } from 'vitest';
import { analysePerson, combineWithDraping, whiteCorrector, PROTOTYPES } from '../engine/faceAnalysis';
import { hexToSrgb, describeHex } from '../engine/colourConversion';
import { applyCorrection, IDENTITY_CORRECTION } from '../engine/colourCorrection';
import type { Vec3 } from '../engine/colourConversion';

const h = (x: string) => hexToSrgb(x);

// Representative feature colours (illustrative, not real people)
const SOFT_SUMMER = { skin: ['#D9B8AA', '#D6B4A7', '#DBBBAE'], hair: ['#7A6A60', '#76675E'], eyes: ['#7E8C8F', '#7B898C'], brows: ['#6B5D56'] };
const TRUE_SPRING = { skin: ['#F0C49A', '#EEC197', '#F2C79E'], hair: ['#C08A3E', '#BE8840'], eyes: ['#3C9AA8', '#3A98A6'], brows: ['#A87A40'] };
const DEEP_WINTER = { skin: ['#C89A82', '#C69880'], hair: ['#1A1614', '#1C1816'], eyes: ['#2A1C16', '#2B1D17'], brows: ['#1E1A18'] };
const mk = (o: typeof SOFT_SUMMER, white?: Vec3) => ({ skin: o.skin.map(h), hair: o.hair.map(h), eyes: o.eyes.map(h), brows: o.brows.map(h), white: white ?? null });

describe('personal colouring analysis', () => {
  it('requires skin, hair and eyes', () => {
    expect(() => analysePerson({ skin: [], hair: [h('#000000')], eyes: [h('#000000')] })).toThrow();
  });
  it('is deterministic and ranks all 12 seasons', () => {
    const a = analysePerson(mk(SOFT_SUMMER)), b = analysePerson(mk(SOFT_SUMMER));
    expect(a.ranking.map((r) => r.id)).toEqual(b.ranking.map((r) => r.id));
    expect(a.ranking).toHaveLength(12);
  });
  it('muted, ashy, low-contrast colouring lands in soft / summer territory', () => {
    const a = analysePerson(mk(SOFT_SUMMER));
    expect(a.dims.clarity).toBeLessThan(0);
    expect(['Soft', 'Cool']).toContain(a.dominant);
    expect(a.ranking.slice(0, 3).map((r) => r.id)).toContain('soft-summer');
  });
  it('golden hair, yellow-leaning skin and clear eyes land in Spring', () => {
    const a = analysePerson(mk(TRUE_SPRING));
    expect(a.dims.temperature).toBeGreaterThan(0.2);
    expect(a.ranking[0].id).toMatch(/spring/);
  });
  it('very dark hair and eyes with lighter skin read deep and high contrast', () => {
    const a = analysePerson(mk(DEEP_WINTER));
    expect(a.dims.value).toBeLessThan(-0.3);
    expect(['Medium-high', 'High']).toContain(a.contrastLevel);
    expect(a.ranking[0].id).toMatch(/deep|winter/);
  });
  it('white reference removes a warm colour cast', () => {
    const warm = { ...IDENTITY_CORRECTION, temperature: 60 };
    const castWhite = applyCorrection([0.92, 0.92, 0.92], warm).srgb;
    const castGrey = labOf(applyCorrection(describeHex('#9A9A9A').srgb, warm).srgb);
    expect(Math.hypot(castGrey.a, castGrey.b)).toBeGreaterThan(4); // the cast is visible
    const fixed = whiteCorrector(castWhite)(castGrey);
    expect(Math.hypot(fixed.a, fixed.b)).toBeLessThan(1.5);          // and removed
  });
  it('flags missing white reference and lowers confidence', () => {
    const a = analysePerson(mk(SOFT_SUMMER));
    expect(a.warnings.some((w) => /white reference/i.test(w))).toBe(true);
    expect(a.confidence).not.toBe('Higher');
  });
  it('draping answers move the ranking towards the chosen poles', () => {
    const a = analysePerson(mk(SOFT_SUMMER));
    const warmClear = combineWithDraping(a, { temperature: 1, clarity: 1, value: null });
    expect(warmClear[0].id).toMatch(/spring|bright/);
  });
  it('every prototype is inside the unit cube', () => {
    Object.values(PROTOTYPES).forEach((p) => p.forEach((v) => expect(Math.abs(v)).toBeLessThanOrEqual(1)));
  });
});

function labOf(srgb: Vec3) { return describeHex('#' + srgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')).lab; }
