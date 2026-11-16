import type { CorrectionSettings } from '../engine/colourCorrection';
import type { Lab, LCh, RGB } from '../engine/colourConversion';
import type { ClothingVerdict, MatchLabel } from '../engine/scoring';
import type { SubSeasonId } from '../data/types';
import { dbClear, dbDelete, dbGetAll, dbPut } from './database';
import { listProfiles, saveProfile, type CalibrationProfile } from './calibrationProfiles';

export interface SavedSample {
  id: string;
  createdAt: number;
  name: string;
  source: 'camera' | 'picker' | 'manual';
  basis: 'corrected' | 'raw';  // which value was used for classification
  rawHex: string;               // raw camera measurement (or manual input)
  correctedHex: string;         // user-corrected estimate
  hex: string;                  // the value that was classified
  rgb: RGB;
  lab: Lab;
  oklch: LCh;
  softSummerMatch: MatchLabel;
  softSummerIndex: number;      // algorithmic similarity index, not a probability
  clothing: ClothingVerdict;
  bestSeason: SubSeasonId;
  bestSeasonName: string;
  stability?: string;
  profile: { id: string; name: string; lighting: string; settings: CorrectionSettings } | null;
  inPalette: boolean;           // part of the personal Soft Summer palette
  notes?: string;
  // Added Nov 2026; older samples may lack these.
  updatedAt?: number;           // used by sync to pick the newer copy
  photo?: string;               // small JPEG data URL (<= 480 px) of what was on screen, sampled spot ringed
  category?: ItemCategory;
  camera?: 'rear' | 'front';    // which camera took the reading
}

export const ITEM_CATEGORIES = [
  'Top', 'Shirt / blouse', 'Knitwear', 'Jacket / coat', 'Blazer / suit', 'Dress', 'Skirt', 'Trousers / jeans',
  'Scarf', 'Shoes', 'Bag', 'Jewellery / watch', 'Glasses', 'Makeup', 'Hair colour', 'Home / paint', 'Other',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const listSamples = async () => (await dbGetAll<SavedSample>('samples')).sort((a, b) => b.createdAt - a.createdAt);
export const putSample = (s: SavedSample) => dbPut('samples', s);
export const deleteSample = (id: string) => dbDelete('samples', id);

export interface ExportFile { app: 'soft-summer-scanner'; version: 1; exportedAt: string; samples: SavedSample[]; profiles: CalibrationProfile[] }

export async function exportAll(): Promise<ExportFile> {
  return { app: 'soft-summer-scanner', version: 1, exportedAt: new Date().toISOString(), samples: await listSamples(), profiles: await listProfiles() };
}

export async function importAll(json: unknown, replace = false): Promise<{ samples: number; profiles: number }> {
  const f = json as Partial<ExportFile>;
  if (!f || f.app !== 'soft-summer-scanner' || !Array.isArray(f.samples) || !Array.isArray(f.profiles)) {
    throw new Error('This file is not a Soft Summer Scanner export.');
  }
  if (replace) { await dbClear('samples'); await dbClear('profiles'); }
  for (const s of f.samples) if (s && typeof s.id === 'string' && typeof s.hex === 'string') await putSample(s);
  for (const p of f.profiles) if (p && typeof p.id === 'string' && p.settings) await saveProfile(p);
  return { samples: f.samples.length, profiles: f.profiles.length };
}
