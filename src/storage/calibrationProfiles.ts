import { IDENTITY_CORRECTION, type CorrectionSettings } from '../engine/colourCorrection';
import { dbDelete, dbGetAll, dbPut, uid } from './database';

export type LightingKind = 'Natural daylight' | 'Indoor warm lighting' | 'Indoor cool lighting' | 'Custom conditions';
export interface CalibrationProfile {
  id: string;
  name: string;
  lighting: LightingKind; // user-defined preset label, not a verified lighting measurement
  settings: CorrectionSettings;
  createdAt: number;
  updatedAt: number;
}

export const listProfiles = async () => (await dbGetAll<CalibrationProfile>('profiles')).sort((a, b) => a.createdAt - b.createdAt);
export const saveProfile = (p: CalibrationProfile) => dbPut('profiles', { ...p, updatedAt: Date.now() });
export const deleteProfile = (id: string) => dbDelete('profiles', id);
export function newProfile(name: string, lighting: LightingKind, settings: CorrectionSettings = IDENTITY_CORRECTION): CalibrationProfile {
  const now = Date.now();
  return { id: uid(), name, lighting, settings: { ...settings }, createdAt: now, updatedAt: now };
}
