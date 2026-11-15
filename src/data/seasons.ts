import type { RawSwatch, SeasonFamily, SubSeasonId } from './types';
import { lightSpring } from './palettes/lightSpring';
import { trueSpring } from './palettes/trueSpring';
import { brightSpring } from './palettes/brightSpring';
import { lightSummer } from './palettes/lightSummer';
import { trueSummer } from './palettes/trueSummer';
import { softSummer } from './palettes/softSummer';
import { softAutumn } from './palettes/softAutumn';
import { trueAutumn } from './palettes/trueAutumn';
import { deepAutumn } from './palettes/deepAutumn';
import { deepWinter } from './palettes/deepWinter';
import { trueWinter } from './palettes/trueWinter';
import { brightWinter } from './palettes/brightWinter';

/**
 * Season attribute profile, in CIELAB L* / C*ab.
 * Temperature is not part of the declared profile: it is judged against each season's own
 * reference colours of similar hue (see engine/seasonalMatching.ts).
 * Ranges describe the season's chromatic (non-neutral) colours. They are an explicit statement
 * of the 12-season model's dimensions (value, chroma, temperature), and are checked against the
 * palette data by src/tests/paletteCoherence.test.ts.
 */
export interface SeasonProfile {
  lightness: [number, number];
  chromaMax: number;
}

export interface SeasonDefinition {
  id: SubSeasonId;
  name: string;
  family: SeasonFamily;
  warm: boolean;
  summary: string;
  profile: SeasonProfile;
  palette: RawSwatch[];
}

export const SEASONS: SeasonDefinition[] = [
  { id: 'light-spring', name: 'Light Spring', family: 'Spring', warm: true, palette: lightSpring,
    summary: 'Light, warm-neutral, fairly clear.', profile: { lightness: [62, 95], chromaMax: 65 } },
  { id: 'true-spring', name: 'True Spring', family: 'Spring', warm: true, palette: trueSpring,
    summary: 'Warm, clear, medium-light.', profile: { lightness: [45, 90], chromaMax: 90 } },
  { id: 'bright-spring', name: 'Bright Spring', family: 'Spring', warm: true, palette: brightSpring,
    summary: 'Bright, warm-neutral, high chroma.', profile: { lightness: [40, 92], chromaMax: 110 } },
  { id: 'light-summer', name: 'Light Summer', family: 'Summer', warm: false, palette: lightSummer,
    summary: 'Light, cool-neutral, soft.', profile: { lightness: [55, 95], chromaMax: 45 } },
  { id: 'true-summer', name: 'True Summer', family: 'Summer', warm: false, palette: trueSummer,
    summary: 'Cool, medium, soft to moderate.', profile: { lightness: [30, 92], chromaMax: 55 } },
  { id: 'soft-summer', name: 'Soft Summer', family: 'Summer', warm: false, palette: softSummer,
    summary: 'Cool to neutral-cool, muted, medium to light-medium, low contrast.',
    profile: { lightness: [32, 82], chromaMax: 30 } },
  { id: 'soft-autumn', name: 'Soft Autumn', family: 'Autumn', warm: true, palette: softAutumn,
    summary: 'Warm-neutral, muted, medium.', profile: { lightness: [32, 85], chromaMax: 42 } },
  { id: 'true-autumn', name: 'True Autumn', family: 'Autumn', warm: true, palette: trueAutumn,
    summary: 'Warm, rich, medium to medium-deep.', profile: { lightness: [25, 75], chromaMax: 70 } },
  { id: 'deep-autumn', name: 'Deep Autumn', family: 'Autumn', warm: true, palette: deepAutumn,
    summary: 'Deep, warm-neutral, rich.', profile: { lightness: [10, 60], chromaMax: 60 } },
  { id: 'deep-winter', name: 'Deep Winter', family: 'Winter', warm: false, palette: deepWinter,
    summary: 'Deep, cool-neutral, clear.', profile: { lightness: [8, 60], chromaMax: 80 } },
  { id: 'true-winter', name: 'True Winter', family: 'Winter', warm: false, palette: trueWinter,
    summary: 'Cool, clear, high contrast.', profile: { lightness: [10, 100], chromaMax: 100 } },
  { id: 'bright-winter', name: 'Bright Winter', family: 'Winter', warm: false, palette: brightWinter,
    summary: 'Bright, cool-neutral, high contrast.', profile: { lightness: [25, 100], chromaMax: 120 } },
];

export const SEASON_BY_ID = Object.fromEntries(SEASONS.map((s) => [s.id, s])) as Record<SubSeasonId, SeasonDefinition>;
export const PRIMARY_SEASON: SubSeasonId = 'soft-summer';
