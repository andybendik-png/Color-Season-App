import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCamera } from './hooks/useCamera';
import { CameraView, type CurrentSample, type SizeKey } from './components/CameraView';
import { ColourResult } from './components/ColourResult';
import { SeasonRanking } from './components/SeasonRanking';
import { CalibrationPanel } from './components/CalibrationPanel';
import { ColourHistory } from './components/ColourHistory';
import { ColourComparison } from './components/ColourComparison';
import { HexAnalyser } from './components/HexAnalyser';
import { InfoPanel } from './components/InfoPanel';
import { SelfieStudio } from './components/SelfieStudio';
import { AccountPanel } from './components/AccountPanel';
import { cloudConfigured, pushAnalysis, pushProfile, pushSample, removeAnalysis, removeProfile as removeCloudProfile, removeSample, watchUser, type CloudUser } from './cloud/cloud';
import { syncAll } from './cloud/sync';
import { deleteAnalysis, listAnalyses, putAnalysis, type SavedAnalysis } from './storage/analyses';
import { applyCorrection, IDENTITY_CORRECTION, type CorrectionSettings } from './engine/colourCorrection';
import { describeHex, srgbToHex, hexToSrgb } from './engine/colourConversion';
import { analyseColour, analyseHex } from './engine/seasonalMatching';
import { deleteProfile, listProfiles, newProfile, saveProfile, type CalibrationProfile, type LightingKind } from './storage/calibrationProfiles';
import { deleteSample, exportAll, importAll, listSamples, putSample, type SavedSample } from './storage/colourHistory';
import { getSetting, setSetting, uid } from './storage/database';

type Tab = 'scan' | 'selfie' | 'hex' | 'saved' | 'compare' | 'calibrate' | 'info';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'scan', label: 'Scan', icon: '◎' }, { id: 'selfie', label: 'Me', icon: '☺' }, { id: 'hex', label: 'HEX', icon: '#' }, { id: 'saved', label: 'Saved', icon: '▦' },
  { id: 'compare', label: 'Compare', icon: '⇄' }, { id: 'calibrate', label: 'Calibrate', icon: '≈' }, { id: 'info', label: 'Guide', icon: 'i' },
];

export default function App() {
  const camera = useCamera();
  const [tab, setTab] = useState<Tab>('scan');
  const [size, setSize] = useState<SizeKey>('M');
  const [current, setCurrent] = useState<CurrentSample | null>(null);
  const [basis, setBasis] = useState<'corrected' | 'raw'>('corrected');
  const [profiles, setProfiles] = useState<CalibrationProfile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CorrectionSettings>({ ...IDENTITY_CORRECTION });
  const [samples, setSamples] = useState<SavedSample[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [hexSeed, setHexSeed] = useState('#8E9196');
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  // Fire-and-forget cloud write when signed in; failures are reported but never block local saves.
  const cloud = useCallback((fn: () => Promise<unknown>) => { if (user) fn().catch(() => setToast('Saved on this device; cloud sync failed. Use Sync now in Account.')); }, [user]);

  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2400); }, []);

  useEffect(() => {
    (async () => {
      try {
        const [p, s, an] = await Promise.all([listProfiles(), listSamples(), listAnalyses()]);
        setProfiles(p); setSamples(s); setAnalyses(an);
        const a = await getSetting<string | null>('activeProfile', null);
        const pr = p.find((x) => x.id === a);
        if (pr) { setActiveId(pr.id); setDraft({ ...pr.settings }); }
        setBasis(await getSetting('basis', 'corrected'));
        setSize(await getSetting('size', 'M'));
      } catch { setStorageOk(false); }
    })();
  }, []);

  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await syncAll();
      const [p, sm, an] = await Promise.all([listProfiles(), listSamples(), listAnalyses()]);
      setProfiles(p); setSamples(sm); setAnalyses(an);
      setLastSync(new Date().toLocaleTimeString(undefined, { timeStyle: 'short' }));
      if (r.pulled || r.pushed) say(`Synced: ${r.pulled} down, ${r.pushed} up`);
    } catch { say('Sync failed. Check your connection.'); }
    finally { setSyncing(false); }
  }, [say]);

  useEffect(() => {
    let off: (() => void) | undefined;
    watchUser((u) => setUser(u)).then((f) => { off = f; }).catch(() => undefined);
    return () => off?.();
  }, []);
  useEffect(() => { if (user) doSync(); }, [user, doSync]);

  const active = profiles.find((p) => p.id === activeId) ?? null;
  // On the Calibrate tab the draft is previewed; elsewhere the saved active profile applies.
  const settings = tab === 'calibrate' ? draft : active?.settings ?? IDENTITY_CORRECTION;

  const onSample = useCallback((s: CurrentSample) => {
    setCurrent((prev) => (prev && prev.source === s.source && srgbToHex(prev.srgb) === srgbToHex(s.srgb) && prev.stability === s.stability ? prev : s));
  }, []);

  const measured = useMemo(() => {
    if (!current) return null;
    const rawHex = srgbToHex(current.srgb);
    const corr = applyCorrection(hexToSrgb(rawHex), settings);
    const correctedHex = srgbToHex(corr.srgb);
    const usedHex = basis === 'raw' ? rawHex : correctedHex;
    return { rawHex, correctedHex, usedHex, clipped: corr.clipped && basis === 'corrected', analysis: analyseColour(describeHex(usedHex)) };
  }, [current, settings, basis]);

  const seasonChip = useMemo(() => {
    if (!measured) return null;
    const p = measured.analysis.primary;
    const m = p.result.match;
    if (/Strong|Good/.test(m)) return { text: `Soft Summer · ${m.replace(' match', '')}`, tone: 'ok' as const };
    const best = measured.analysis.best.season.id === 'soft-summer' ? p.alternative.season.name : measured.analysis.best.season.name;
    if (/Possible/.test(m)) return { text: `Soft Summer? Borderline · closer: ${best}`, tone: 'warn' as const };
    return { text: `Not Soft Summer · ${best}`, tone: 'bad' as const };
  }, [measured]);

  const copy = useCallback(async (hex: string) => {
    try { await navigator.clipboard.writeText(hex); say(`Copied ${hex}`); } catch { say(`HEX: ${hex}`); }
  }, [say]);

  const saveFrom = useCallback(async (rawHex: string, correctedHex: string, used: 'corrected' | 'raw', source: SavedSample['source'], stability?: string, profile?: CalibrationProfile | null) => {
    const hex = used === 'raw' ? rawHex : correctedHex;
    const a = analyseHex(hex);
    const d = a.colour;
    const s: SavedSample = {
      id: uid(), createdAt: Date.now(), name: `Near ${a.closestOverall.ref.name}`, source, basis: used, rawHex, correctedHex, hex,
      rgb: d.rgb, lab: d.lab, oklch: d.oklch, softSummerMatch: a.primary.result.match, softSummerIndex: a.primary.result.similarityIndex,
      clothing: a.primary.clothing, bestSeason: a.best.season.id, bestSeasonName: a.best.season.name, stability,
      profile: used === 'corrected' && profile ? { id: profile.id, name: profile.name, lighting: profile.lighting, settings: { ...profile.settings } } : null,
      inPalette: /Strong|Good/.test(a.primary.result.match),
    };
    try { await putSample(s); setSamples((x) => [s, ...x]); say('Saved'); cloud(() => pushSample(s)); } catch { say('Could not save — storage unavailable'); }
  }, [say, cloud]);

  const saveCurrent = () => {
    if (!measured || !current) return;
    saveFrom(measured.rawHex, measured.correctedHex, basis, current.source === 'picker' ? 'picker' : 'camera', current.stability, active);
  };

  const updateSample = async (s: SavedSample) => { await putSample(s); setSamples((x) => x.map((y) => (y.id === s.id ? s : y))); cloud(() => pushSample(s)); };
  const dropSample = async (id: string) => { await deleteSample(id); setSamples((x) => x.filter((y) => y.id !== id)); setCompareIds((c) => c.filter((y) => y !== id)); cloud(() => removeSample(id)); };
  const toggleCompare = (id: string) => setCompareIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const activate = (id: string | null) => {
    setActiveId(id); setSetting('activeProfile', id);
    const p = profiles.find((x) => x.id === id);
    setDraft({ ...(p?.settings ?? IDENTITY_CORRECTION) });
  };
  const persistProfile = async (p: CalibrationProfile) => {
    await saveProfile(p);
    setProfiles((x) => x.map((y) => (y.id === p.id ? { ...p, updatedAt: Date.now() } : y)));
    cloud(() => pushProfile({ ...p, updatedAt: Date.now() }));
    if (p.id === activeId) setDraft({ ...p.settings });
    say('Profile saved');
  };
  const createProfile = async (name: string, lighting: LightingKind, s: CorrectionSettings) => {
    const p = newProfile(name, lighting, s);
    await saveProfile(p);
    setProfiles((x) => [...x, p]);
    cloud(() => pushProfile(p));
    setActiveId(p.id); setSetting('activeProfile', p.id); setDraft({ ...p.settings });
    say(`Profile “${name}” saved and applied`);
  };
  const removeProfile = async (id: string) => {
    await deleteProfile(id);
    setProfiles((x) => x.filter((y) => y.id !== id));
    cloud(() => removeCloudProfile(id));
    if (activeId === id) activate(null);
  };

  const doExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `soft-summer-scanner-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const doImport = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const r = await importAll(json, false);
      setSamples(await listSamples()); setProfiles(await listProfiles());
      if (user) doSync();
      say(`Imported ${r.samples} colours, ${r.profiles} profiles`);
    } catch (e) { say(e instanceof Error ? e.message : 'Import failed'); }
  };

  const goTab = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };
  const openHex = (hex: string) => { setHexSeed(hex); goTab('hex'); };
  const openSample = (s: SavedSample) => openHex(s.hex);

  return (
    <div className="app">
      <header className="appbar">
        <h1 className="appbar__title">Soft Summer <span>Scanner</span></h1>
        <div className="appbar__right">
          {active && tab !== 'calibrate' && <span className="appbar__profile" title="Active calibration profile">{active.name}</span>}
          {cloudConfigured() && <button className="appbar__acct" onClick={() => setAccountOpen(true)} aria-label="Account">{user ? (user.email?.[0] ?? '•').toUpperCase() : 'Sign in'}</button>}
          {!cloudConfigured() && <button className="appbar__acct appbar__acct--off" onClick={() => setAccountOpen(true)} aria-label="Account">Account</button>}
        </div>
      </header>
      {!storageOk && <p className="banner">Local storage is unavailable (private browsing?). Samples and profiles will not be kept.</p>}

      <main className="main">
        {tab === 'scan' && (
          <>
            <CameraView camera={camera} onSample={onSample} size={size} onSize={(s) => { setSize(s); setSetting('size', s); }} previewHex={measured?.usedHex} seasonChip={seasonChip} />
            {measured ? (
              <>
                <ColourResult analysis={measured.analysis} rawHex={measured.rawHex} correctedHex={measured.correctedHex} basis={basis}
                  onBasis={(b) => { setBasis(b); setSetting('basis', b); }} profileName={active?.name ?? null}
                  stability={current?.source === 'camera' ? current.stability : undefined} onSave={saveCurrent} onCopy={copy} clipped={measured.clipped} />
                <SeasonRanking analysis={measured.analysis} />
              </>
            ) : camera.state === 'live' ? <p className="small muted center">Reading colour…</p> : null}
          </>
        )}
        {tab === 'selfie' && (
          <SelfieStudio saved={analyses} signedIn={!!user}
            onSave={async (a) => { await putAnalysis(a); setAnalyses((x) => [a, ...x.filter((y) => y.id !== a.id)]); say('Analysis saved'); cloud(() => pushAnalysis(a)); }}
            onDelete={async (id) => { await deleteAnalysis(id); setAnalyses((x) => x.filter((y) => y.id !== id)); cloud(() => removeAnalysis(id)); }} />
        )}
        {tab === 'hex' && <HexAnalyser key={hexSeed} initial={hexSeed} onCopy={copy} onSave={(hex) => saveFrom(hex, hex, 'raw', 'manual')} />}
        {tab === 'saved' && (
          <ColourHistory samples={samples} compareIds={compareIds} onToggleCompare={toggleCompare} onUpdate={updateSample} onDelete={dropSample}
            onCopy={copy} onOpen={openSample} onExport={doExport} onImport={doImport} />
        )}
        {tab === 'compare' && <ColourComparison samples={samples} compareIds={compareIds} onToggle={toggleCompare} onClear={() => setCompareIds([])} />}
        {tab === 'calibrate' && (
          <>
            <CameraView camera={camera} onSample={onSample} size={size} onSize={setSize} compact previewHex={measured?.correctedHex} seasonChip={seasonChip} />
            <CalibrationPanel sampleSrgb={current?.srgb ?? null} profiles={profiles} activeId={activeId} onActivate={activate}
              onSaveProfile={persistProfile} onCreateProfile={createProfile} onDeleteProfile={removeProfile} draft={draft} setDraft={setDraft} />
          </>
        )}
        {tab === 'info' && <InfoPanel onAnalyse={openHex} />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      {accountOpen && <AccountPanel user={user} syncing={syncing} lastSync={lastSync} onSync={doSync} onClose={() => setAccountOpen(false)} />}

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={`tabbar__btn ${tab === t.id ? 'is-on' : ''}`} onClick={() => goTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <span className="tabbar__icon" aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === 'compare' && compareIds.length > 0 && <span className="tabbar__badge">{compareIds.length}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
