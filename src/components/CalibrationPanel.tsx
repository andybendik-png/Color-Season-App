import { useEffect, useRef, useState } from 'react';
import { applyCorrection, IDENTITY_CORRECTION, CORRECTION_ORDER, type CorrectionSettings } from '../engine/colourCorrection';
import { srgbToHex, type Vec3 } from '../engine/colourConversion';
import { deltaE2000 } from '../engine/deltaE';
import { describeSrgb } from '../engine/colourConversion';
import type { CalibrationProfile, LightingKind } from '../storage/calibrationProfiles';
import { fmt } from './format';

interface Props {
  sampleSrgb: Vec3 | null;
  profiles: CalibrationProfile[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onSaveProfile: (p: CalibrationProfile) => void;
  onCreateProfile: (name: string, lighting: LightingKind, settings: CorrectionSettings) => void;
  onDeleteProfile: (id: string) => void;
  draft: CorrectionSettings;
  setDraft: (s: CorrectionSettings) => void;
}

type Key = keyof CorrectionSettings;
const SLIDERS: { key: Key; label: string; min: number; max: number; step: number; left: string; right: string; unit?: string; advanced?: boolean }[] = [
  { key: 'temperature', label: 'Warm ↔ Cool', min: -100, max: 100, step: 1, left: 'Cooler', right: 'Warmer' },
  { key: 'tint', label: 'Green ↔ Magenta', min: -100, max: 100, step: 1, left: 'Greener', right: 'More magenta' },
  { key: 'exposure', label: 'Brightness', min: -2, max: 2, step: 0.05, left: 'Darker', right: 'Brighter', unit: ' EV' },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, left: 'Less', right: 'More', unit: '%' },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, left: 'Less', right: 'More', unit: '%', advanced: true },
  { key: 'rGain', label: 'Red channel', min: -50, max: 50, step: 1, left: '−', right: '+', unit: '%', advanced: true },
  { key: 'gGain', label: 'Green channel', min: -50, max: 50, step: 1, left: '−', right: '+', unit: '%', advanced: true },
  { key: 'bGain', label: 'Blue channel', min: -50, max: 50, step: 1, left: '−', right: '+', unit: '%', advanced: true },
];
const LIGHTING: LightingKind[] = ['Natural daylight', 'Indoor warm lighting', 'Indoor cool lighting', 'Custom conditions'];

export function CalibrationPanel({ sampleSrgb, profiles, activeId, onActivate, onSaveProfile, onCreateProfile, onDeleteProfile, draft, setDraft }: Props) {
  const [past, setPast] = useState<CorrectionSettings[]>([]);
  const [future, setFuture] = useState<CorrectionSettings[]>([]);
  const lastPush = useRef<{ key: Key | null; t: number }>({ key: null, t: 0 });
  const [newName, setNewName] = useState('');
  const [newLighting, setNewLighting] = useState<LightingKind>('Natural daylight');
  const [renaming, setRenaming] = useState(false);
  const active = profiles.find((p) => p.id === activeId) ?? null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(active?.settings ?? IDENTITY_CORRECTION);

  useEffect(() => { setPast([]); setFuture([]); }, [activeId]);

  const change = (key: Key, value: number) => {
    const now = Date.now();
    if (lastPush.current.key !== key || now - lastPush.current.t > 600) setPast((p) => [...p.slice(-49), draft]);
    lastPush.current = { key, t: now };
    setFuture([]);
    setDraft({ ...draft, [key]: value });
  };
  const undo = () => { if (!past.length) return; setFuture((f) => [draft, ...f]); setDraft(past[past.length - 1]); setPast((p) => p.slice(0, -1)); lastPush.current.key = null; };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, draft]); setDraft(future[0]); setFuture((f) => f.slice(1)); lastPush.current.key = null; };
  const reset = () => { setPast((p) => [...p, draft]); setFuture([]); setDraft({ ...IDENTITY_CORRECTION }); };

  const raw = sampleSrgb ? srgbToHex(sampleSrgb) : null;
  const corr = sampleSrgb ? applyCorrection(sampleSrgb, draft) : null;
  const corrHex = corr ? srgbToHex(corr.srgb) : null;
  const dE = sampleSrgb && corr ? deltaE2000(describeSrgb(sampleSrgb).lab, describeSrgb(corr.srgb).lab) : null;

  return (
    <section className="calib">
      <div className="callout">
        <p><strong>This is visual matching, not calibration.</strong> You are adjusting the camera reading until the on-screen swatch looks like the real object to you. The screen has its own white point and brightness, and the room light affects both. The result is a personal correction preset, not a scientifically calibrated measurement. The raw reading is always kept.</p>
      </div>

      <div className="calib__compare">
        <div className="calib__sw"><div className="calib__chip" style={{ background: raw ?? 'transparent' }} /><p className="small">Original</p><p className="mono">{raw ?? '—'}</p></div>
        <div className="calib__sw"><div className="calib__chip" style={{ background: corrHex ?? 'transparent' }} /><p className="small">Corrected</p><p className="mono">{corrHex ?? '—'}</p></div>
      </div>
      {!sampleSrgb && <p className="small muted">Start the camera and point it at the object (Freeze helps hold it still).</p>}
      {dE !== null && <p className="small muted center">Change applied: ΔE00 {fmt(dE, 1)}{corr?.clipped ? ' · gamut-mapped' : ''}</p>}

      <div className="row gap">
        <button className="btn" onClick={undo} disabled={!past.length}>Undo</button>
        <button className="btn" onClick={redo} disabled={!future.length}>Redo</button>
        <button className="btn" onClick={reset}>Reset</button>
      </div>

      <div className="sliders">
        {SLIDERS.filter((s) => !s.advanced).map((s) => <Slider key={s.key} s={s} value={draft[s.key]} onChange={(v) => change(s.key, v)} />)}
        <details>
          <summary>Advanced: contrast and RGB channels</summary>
          {SLIDERS.filter((s) => s.advanced).map((s) => <Slider key={s.key} s={s} value={draft[s.key]} onChange={(v) => change(s.key, v)} />)}
        </details>
      </div>

      <div className="card">
        <h3 className="card__title">Profiles</h3>
        <p className="small muted">The selected profile is applied to every new sample. Lighting names are your own labels, not detected conditions.</p>
        <label className="field">
          <span>Active profile</span>
          <select value={activeId ?? ''} onChange={(e) => onActivate(e.target.value || null)}>
            <option value="">No correction (raw camera)</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.lighting}</option>)}
          </select>
        </label>
        {active && (
          <div className="row gap wrap">
            <button className="btn btn--primary" disabled={!dirty} onClick={() => onSaveProfile({ ...active, settings: { ...draft } })}>Save changes</button>
            {renaming ? (
              <RenameBox initial={active.name} lighting={active.lighting} onDone={(name, lighting) => { setRenaming(false); if (name) onSaveProfile({ ...active, name, lighting, settings: active.settings }); }} />
            ) : <button className="btn" onClick={() => setRenaming(true)}>Rename</button>}
            <button className="btn btn--danger" onClick={() => { if (confirm(`Delete profile "${active.name}"?`)) onDeleteProfile(active.id); }}>Delete</button>
          </div>
        )}
        {!active && dirty && <p className="small warn">These adjustments are a preview. Save them as a profile to apply them to samples.</p>}
        <div className="newprof">
          <input placeholder="New profile name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <select value={newLighting} onChange={(e) => setNewLighting(e.target.value as LightingKind)}>
            {LIGHTING.map((l) => <option key={l}>{l}</option>)}
          </select>
          <button className="btn" disabled={!newName.trim()} onClick={() => { onCreateProfile(newName.trim(), newLighting, draft); setNewName(''); }}>Save current as new</button>
        </div>
      </div>

      <details className="card">
        <summary>How the correction is applied</summary>
        <ol className="small">{CORRECTION_ORDER.map((s) => <li key={s}>{s}</li>)}</ol>
      </details>
    </section>
  );
}

function Slider({ s, value, onChange }: { s: (typeof SLIDERS)[number]; value: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider__top"><span>{s.label}</span><span className="mono">{value > 0 ? '+' : ''}{s.step < 1 ? value.toFixed(2) : value}{s.unit ?? ''}</span></span>
      <input type="range" min={s.min} max={s.max} step={s.step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(0)} />
      <span className="slider__ends small muted"><span>{s.left}</span><span>{s.right}</span></span>
    </label>
  );
}

function RenameBox({ initial, lighting, onDone }: { initial: string; lighting: LightingKind; onDone: (n: string | null, l: LightingKind) => void }) {
  const [v, setV] = useState(initial);
  const [l, setL] = useState(lighting);
  return (
    <span className="row gap wrap">
      <input value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      <select value={l} onChange={(e) => setL(e.target.value as LightingKind)}>{LIGHTING.map((x) => <option key={x}>{x}</option>)}</select>
      <button className="btn" onClick={() => onDone(v.trim() || null, l)}>Save name</button>
    </span>
  );
}
