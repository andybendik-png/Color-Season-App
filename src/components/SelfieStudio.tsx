import type { PersonalAnalysis } from '../engine/faceAnalysis';
import { combineWithDraping } from '../engine/faceAnalysis';
import { useMemo, useState } from 'react';
import type { FaceSession } from '../hooks/useFaceSession';
import type { SavedAnalysis } from '../storage/analyses';
import { PhotoMarkers } from './PhotoMarkers';
import { DrapeTest } from './DrapeTest';
import { PhotoPicker } from './PhotoPicker';
import { fmt } from './format';

type Sub = 'colour' | 'drape';

interface Props { session: FaceSession; saved: SavedAnalysis[]; onDelete: (id: string) => void; signedIn: boolean; onSaved: () => void }

/** Colour tab: season from the shared face photo, plus the virtual drape test. */
export function SelfieStudio({ session: s, saved, onDelete, signedIn, onSaved }: Props) {
  const [sub, setSub] = useState<Sub>('colour');
  const faceBox = useMemo(() => {
    if (!s.points) return null;
    const xs = [s.points.cheekL.x, s.points.cheekR.x], ys = [s.points.forehead.y, s.points.chin.y];
    const w = Math.abs(xs[1] - xs[0]) * 1.6, h = Math.abs(ys[1] - ys[0]) * 1.5;
    return { x: (xs[0] + xs[1]) / 2 - w / 2, y: ys[0] - h * 0.2, w, h };
  }, [s.points]);

  if (!s.photo || !s.points) return <section className="selfie"><PhotoPicker session={s} saved={saved} onDelete={onDelete} signedIn={signedIn} mode="colour" /></section>;
  const points = s.points;
  return (
    <section className="selfie">
      <div className="row gap">
        <button className="btn" onClick={s.reset}>← New photo</button>
        <button className="btn btn--primary" style={{ flex: 1 }} onClick={async () => { if (await s.save()) onSaved(); }} disabled={!s.colour || s.saving}>
          {s.saving ? 'Saving…' : s.currentId ? 'Update saved analysis' : 'Save analysis'}</button>
      </div>
      {s.status && <p className="small muted" role="status">{s.status}</p>}
      <PhotoMarkers canvas={s.photo} points={points} showWhite={s.useWhite} onChange={(k, p) => s.setPoints((prev) => (prev ? { ...prev, [k]: p } : prev))} />
      <label className="check"><input type="checkbox" checked={s.useWhite} onChange={(e) => s.setUseWhite(e.target.checked)} /> There's something white in the photo (paper, white top). Drag the “White” point onto it.</label>
      <div className="seg" role="group" aria-label="Section">
        <button className={`seg__btn ${sub === 'colour' ? 'is-on' : ''}`} onClick={() => setSub('colour')}>Colouring</button>
        <button className={`seg__btn ${sub === 'drape' ? 'is-on' : ''}`} onClick={() => setSub('drape')}>Drape test</button>
      </div>
      {sub === 'colour' && s.colour && <PersonResult a={s.colour} combined={s.combined} />}
      {sub === 'drape' && faceBox && <DrapeTest photo={s.photo} chinY={points.chin.y + Math.abs(points.chin.y - points.cheekL.y) * 0.3} faceBox={faceBox} initial={s.drape} onDone={s.setDrape} />}
    </section>
  );
}

function Dim({ label, left, right, v }: { label: string; left: string; right: string; v: number }) {
  return (
    <div className="pdim">
      <div className="pdim__top"><span>{label}</span><span className="mono small">{v > 0 ? '+' : ''}{fmt(v, 2)}</span></div>
      <div className="pdim__track"><span className="pdim__dot" style={{ left: `${50 + v * 50}%` }} /></div>
      <div className="pdim__ends small muted"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

function PersonResult({ a, combined }: { a: PersonalAnalysis; combined: ReturnType<typeof combineWithDraping> | null }) {
  const ranking = combined ?? a.ranking;
  const feat = (label: string, f: PersonalAnalysis['skin']) => (
    <div className="feat"><span className="feat__sw" style={{ background: f.hex }} /><span className="feat__label">{label}</span>
      <span className="mono small">{f.hex}</span><span className="small muted">L* {fmt(f.lab.L, 0)} · C* {fmt(f.C, 0)} · h {fmt(f.h, 0)}°</span></div>
  );
  return (
    <>
      <div className={`verdict verdict--${a.confidence === 'Higher' ? 'ok' : a.confidence === 'Moderate' ? 'ok2' : 'warn'}`}>
        <p className="verdict__eyebrow">{combined ? 'Photo + drape test' : 'From the photo'}</p>
        <p className="verdict__headline">Closest: {ranking[0].name}</p>
        <p className="verdict__meta">Then {ranking[1].name} and {ranking[2].name} · leading trait {a.dominant}, then {a.secondary} · confidence {a.confidence.toLowerCase()}</p>
      </div>
      <p className="small">{a.softSummerNote}</p>
      {a.warnings.length > 0 && <ul className="small warn">{a.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
      <div className="card">
        <h3 className="card__title">Your measured colouring</h3>
        <div className="feats">
          {feat('Skin', a.skin)}{feat('Hair', a.hair)}{feat('Eyes', a.eyes)}{a.brows && feat('Brows', a.brows)}
        </div>
        <p className="small muted">{a.whiteCorrected ? 'Colour cast removed using your white reference.' : 'No white reference used.'} Contrast between features: {a.contrastLevel.toLowerCase()} ({fmt(a.contrast, 0)} L* units). Skin hue angle {fmt(a.skinHue, 0)}° (higher reads yellower/warmer).</p>
        <Dim label="Temperature" left="Cool" right="Warm" v={a.dims.temperature} />
        <Dim label="Value" left="Deep" right="Light" v={a.dims.value} />
        <Dim label="Chroma" left="Soft" right="Clear" v={a.dims.clarity} />
      </div>
      <div className="card">
        <h3 className="card__title">12 seasons{combined ? ' (photo + drape)' : ''}</h3>
        <ol className="rank">
          {ranking.map((r, i) => (
            <li key={r.id} className={`rank__row ${r.id === 'soft-summer' ? 'is-primary' : ''}`}>
              <div className="rank__head"><span className="rank__n">{i + 1}</span><span className="rank__name">{r.name}</span>
                <span className="rank__bar"><span style={{ width: `${r.score}%` }} /></span><span className="rank__score mono">{r.score}</span></div>
            </li>
          ))}
        </ol>
        <p className="small muted">Scores show closeness to each season's profile. They are not probabilities.</p>
      </div>
    </>
  );
}
