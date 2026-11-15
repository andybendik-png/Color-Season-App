import type { PointKey, SamplePoint } from '../engine/faceLandmarks';
import type { BrowStyle } from '../engine/brows';
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
}

export const listAnalyses = async () => (await dbGetAll<SavedAnalysis>('analyses')).sort((a, b) => b.createdAt - a.createdAt);
export const putAnalysis = (a: SavedAnalysis) => dbPut('analyses', a);
export const deleteAnalysis = (id: string) => dbDelete('analyses', id);
