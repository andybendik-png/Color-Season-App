import { listSamples, putSample } from '../storage/colourHistory';
import { listProfiles, saveProfile } from '../storage/calibrationProfiles';
import { listAnalyses, putAnalysis } from '../storage/analyses';
import { pullAll, pushAnalysis, pushProfile, pushSample } from './cloud';

/** Two-way merge by id; the newer copy wins (updatedAt, else createdAt). Deletions are pushed as they happen. */
export async function syncAll(): Promise<{ pulled: number; pushed: number }> {
  const remote = await pullAll();
  const [ls, lp, la] = await Promise.all([listSamples(), listProfiles(), listAnalyses()]);
  let pulled = 0, pushed = 0;
  const stamp = (x: { createdAt: number; updatedAt?: number }) => x.updatedAt ?? x.createdAt;
  async function merge<T extends { id: string; createdAt: number; updatedAt?: number }>(local: T[], rem: T[], putLocal: (t: T) => Promise<unknown>, putRemote: (t: T) => Promise<unknown>) {
    const lm = new Map(local.map((x) => [x.id, x])), rm = new Map(rem.map((x) => [x.id, x]));
    for (const r of rem) { const l = lm.get(r.id); if (!l || stamp(r) > stamp(l)) { await putLocal(r); pulled++; } }
    for (const l of local) { const r = rm.get(l.id); if (!r || stamp(l) > stamp(r)) { await putRemote(l); pushed++; } }
  }
  await merge(ls, remote.samples, putSample, pushSample);
  await merge(lp, remote.profiles, saveProfile, pushProfile);
  await merge(la, remote.analyses, putAnalysis, pushAnalysis);
  return { pulled, pushed };
}
