import type { PointKey, SamplePoint } from '../engine/faceLandmarks';
import type { BrowStyle, Pt } from '../engine/brows';
import type { LineKey, Pose } from '../engine/proportions';
import type { FaceProfile } from '../engine/faceStyling';
import { dbDelete, dbGetAll, dbPut } from './database';

export interface DrapeAnswers { clarity: number | null; temperature: number | null; value: number | null }
export interface SavedAnalysis {
  id: string;
  createdAt: number;
  updatedAt: number;
  name: string;
  photo: string;            // JPEG data URL (max ~900 px, ~100–200 KB)
  width: number;
  height: number;
  points: Record<PointKey, SamplePoint>;
  useWhite: boolean;
  landmarks: number[] | null; // flattened x,y pairs in photo pixels (for brows), or null
  browStyle: BrowStyle;
  drape: DrapeAnswers;
  summary: { topSeason: string; topSeasonId: string; confidence: string; dominant: string; secondary: string; combinedTop?: string };
  // Added Nov 2026 (optional so older analyses still open)
  pose?: Pose | null;
  proportions?: {
    lines: Record<LineKey, Pt>;      // photo pixels of the saved (downscaled) photo
    hairlineEstimated: boolean;
    profile: FaceProfile;
    thirds: [number, number, number]; // mm upper, middle, lower
    spacingRatio: number;            // gap between eyes ÷ eye width
    lengthToWidth: number;
  };
  browOverrides?: BrowOverrides;
}

/** User-adjusted brow guide positions (local x in the brow frame, per side). */
export type BrowOverrides = Partial<Record<'A' | 'B', { startX?: number; peakX?: number; tailX?: number }>>;

export const listAnalyses = async () => (await dbGetAll<SavedAnalysis>('analyses')).sort((a, b) => b.createdAt - a.createdAt);
export const putAnalysis = (a: SavedAnalysis) => dbPut('analyses', a);
export const deleteAnalysis = (id: string) => dbDelete('analyses', id);
