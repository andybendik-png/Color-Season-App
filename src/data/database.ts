/**
 * Builds the structured reference database from the compact palette files. Every derived value
 * (RGB, CIELAB, OKLCH, classifications) is computed with the same engine used for camera
 * samples, so the data can be replaced or expanded without touching the matching algorithm.
 */
import { describeHex, type ColourDescription, type Lab, type LCh, type RGB } from '../engine/colourConversion';
import { attributesOf, makeRelativeTemperature, type ChromaClass, type LightnessClass, type TemperatureClass } from '../engine/attributes';
import { SEASONS } from './seasons';
import type { ColourCategory, SeasonFamily, SubSeasonId } from './types';

export interface ReferenceColour {
  id: string;
  name: string;
  hex: string;
  rgb: RGB;
  lab: Lab;
  oklch: LCh;
  family: SeasonFamily;
  subSeason: SubSeasonId;
  category: ColourCategory;
  temperature: TemperatureClass;
  chroma: ChromaClass;
  lightness: LightnessClass;
  undertone: number;
  source: string;
  quality: 'illustrative-digital-approximation' | 'measured-physical-swatch';
  desc: ColourDescription;
}

export const SOURCE_NOTE =
  'Authored from published descriptions of the 12-season (tonal / Sci\\ART-derived) system; not measured from physical swatches.';

// eslint-disable-next-line prefer-const
export let RELATIVE_TEMPERATURE: (u: number, h: number, C: number, L: number) => number = (u) => u;

function build(): ReferenceColour[] {
  const pre = SEASONS.flatMap((s) => s.palette.map(([name, hex, category], i) => ({ s, name, hex, category, i, desc: describeHex(hex) })));
  const relative = makeRelativeTemperature(pre.map((p) => ({ h: p.desc.oklch.h, C: p.desc.lch.C, L: p.desc.lab.L, warm: p.s.warm })));
  RELATIVE_TEMPERATURE = relative;
  const colours = pre.map(({ s, name, category, i, desc }) => {
    const at = attributesOf(desc, relative);
    return {
      id: `${s.id}-${String(i + 1).padStart(3, '0')}`, name, hex: desc.hex, rgb: desc.rgb, lab: desc.lab, oklch: desc.oklch,
      family: s.family, subSeason: s.id, category, temperature: at.temperature, chroma: at.chromaClass,
      lightness: at.lightnessClass, undertone: at.undertone, source: SOURCE_NOTE,
      quality: 'illustrative-digital-approximation' as const, desc,
    };
  });
  // Hex sanity: authored hex must round-trip
  for (const c of colours) if (!/^#[0-9A-F]{6}$/.test(c.hex)) throw new Error(`Bad hex in ${c.id}`);
  return colours;
}

export const REFERENCE_COLOURS: ReferenceColour[] = build();
export const coloursBySeason = (id: SubSeasonId) => REFERENCE_COLOURS.filter((c) => c.subSeason === id);
