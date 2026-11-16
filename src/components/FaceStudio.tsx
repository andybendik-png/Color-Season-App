import { useMemo, useState } from 'react';
import type { FaceSession } from '../hooks/useFaceSession';
import type { SavedAnalysis } from '../storage/analyses';
import { styleTips, type FaceProfile, type Tip } from '../engine/faceStyling';
import { PhotoPicker } from './PhotoPicker';
import { ProportionOverlay } from './ProportionOverlay';
import { BrowStudio } from './BrowStudio';
import { fmt, fmtDate } from './format';

type Sub = 'proportions' | 'brows' | 'progress';
interface Props {
  session: FaceSession; saved: SavedAnalysis[]; onDelete: (id: string) => void; signedIn: boolean; onSaved: () => void;
  profile: FaceProfile; onProfile: (p: FaceProfile) => void;
}

const OPTS: { key: keyof FaceProfile; label: string; values: [string, string][] }[] = [
  { key: 'presentation', label: 'Style advice for', values: [['man', 'Men'], ['woman', 'Women'], ['unspecified', 'Anyone']] },
  { key: 'hairLength', label: 'Hair length', values: [['shaved', 'Shaved'], ['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']] },
  { key: 'hairline', label: 'Hairline', values: [['full', 'Full'], ['receding', 'Receding'], ['thinning', 'Thinning']] },
  { key: 'facialHair', label: 'Facial hair', values: [['none', 'None'], ['stubble', 'Stubble'], ['short', 'Short beard'], ['full', 'Full beard'], ['cannot', "Can't grow"]] },
  { key: 'glasses', label: 'Glasses', values: [['no', 'No'], ['yes', 'Yes'], ['open', 'Open to it']] },
];

export function FaceStudio({ session: s, saved, onDelete, signedIn, onSaved, profile, onProfile }: Props) {
  const [sub, setSub] = useState<Sub>('proportions');
  const [show, setShow] = useState<'thirds' | 'fifths' | 'both'>('thirds');
  const [preview, setPreview] = useState<Tip | null>(null);
  const tips = useMemo(() => (s.proportions ? styleTips(s.proportions, profile) : []), [s.proportions, profile]);
  const history = useMemo(() => saved.filter((a) => a.proportions).sort((a, b) => a.createdAt - b.createdAt), [saved]);

  if (!s.photo) return <section className="selfie"><PhotoPicker session={s} saved={saved} onDelete={onDelete} signedIn={signedIn} mode="face" /></section>;
  const r = s.proportions;
  const beardHint = s.detected?.beardFound && (profile.facialHair === 'none' || profile.facialHair === 'cannot');

  return (
    <section className="selfie">
      <div className="row gap">
        <button className="btn" onClick={s.reset}>← New photo</button>
        <button className="btn btn--primary" style={{ flex: 1 }} onClick={async () => { if (await s.save()) onSaved(); }} disabled={!s.colour || s.saving}>
          {s.saving ? 'Saving…' : s.currentId ? 'Update saved analysis' : 'Save analysis'}</button>
      </div>
      {s.status && <p className="small muted" role="status">{s.status}</p>}

      <div className="seg" role="group" aria-label="Section">
        <button className={`seg__btn ${sub === 'proportions' ? 'is-on' : ''}`} onClick={() => setSub('proportions')}>Proportions</button>
        <button className={`seg__btn ${sub === 'brows' ? 'is-on' : ''}`} onClick={() => setSub('brows')}>Brows</button>
        <button className={`seg__btn ${sub === 'progress' ? 'is-on' : ''}`} onClick={() => setSub('progress')}>Progress</button>
      </div>

      {sub === 'proportions' && !s.landmarks && (
        <div className="card"><p className="small">Proportions need the automatic face landmarks, which weren't found in this photo. Try a straight-on photo in even light with your whole face visible.</p></div>
      )}

      {sub === 'proportions' && r && s.lines && (
        <>
          <div className="seg seg--small" role="group" aria-label="Show">
            {(['thirds', 'fifths', 'both'] as const).map((k) => <button key={k} className={`seg__btn ${show === k ? 'is-on' : ''}`} onClick={() => setShow(k)}>{k === 'thirds' ? 'Thirds' : k === 'fifths' ? 'Fifths' : 'Both'}</button>)}
          </div>
          <ProportionOverlay photo={s.photo} lines={s.lines} result={r} onMove={s.moveLine} visual={preview?.visual ?? null} show={show} />
          <p className="small muted">Drag the white handles if a line missed. {preview?.visual ? <>Showing: <strong>{preview.title}</strong>. <button className="linkbtn" onClick={() => setPreview(null)}>Hide</button></> : 'Tap a tip with a ▣ to see it on your photo.'}</p>
          <button className="linkbtn" onClick={() => { s.resetLines(); setPreview(null); }}>Reset lines to automatic</button>
          {r.warnings.length > 0 && <ul className="small warn">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

          <div className="card">
            <h3 className="card__title">Thirds (as seen)</h3>
            {r.thirds.map((t) => <Bar key={t.key} label={t.label} value={t.share} target={1 / 3} level={t.level} right={`${fmt(t.mm, 0)} mm · ${Math.round(t.share * 100)}%`} />)}
            <p className="small muted">Equal thirds (33% each) is a classical convention. Real, attractive faces vary, so only a third marked “stands out” is worth styling around. Lower third: upper lip is {Math.round(r.lowerSplit.upperLipShare * 100)}% of it (convention ≈ 33%).</p>
          </div>
          <div className="card">
            <h3 className="card__title">Fifths at eye level</h3>
            {r.fifths.map((fi) => <Bar key={fi.key} label={fi.label} value={fi.ratioToEye / 2} target={0.5} level={fi.key === 'gap' ? r.spacing.level : 'Balanced'} right={`${fmt(fi.mm, 0)} mm · ${fi.ratioToEye.toFixed(2)}× eye`} />)}
            <p className="small">Eye spacing: <strong>{r.spacing.label}</strong> (gap is {r.spacing.ratio.toFixed(2)}× an eye width). Face length to visible width: {r.lengthToWidth.toFixed(2)} ({r.shape.toLowerCase()}).</p>
            <p className="small muted">The outer two are your visible face width at eye level (hair over the temples counts), not the classic ear-to-ear fifths. Close selfies widen the centre of the face, so take this photo from arm's length or further.</p>
          </div>

          <div className="card">
            <h3 className="card__title">About you</h3>
            <p className="small muted">Saved for next time. Tips only suggest changes within what you have.</p>
            {OPTS.map((o) => (
              <div key={o.key} className="field">
                <span>{o.label}</span>
                <div className="chips" role="radiogroup" aria-label={o.label}>
                  {o.values.map(([v, l]) => (
                    <button key={v} role="radio" aria-checked={profile[o.key] === v} className={`chipbtn ${profile[o.key] === v ? 'is-on' : ''}`}
                      onClick={() => onProfile({ ...profile, [o.key]: v } as FaceProfile)}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
            {beardHint && <p className="small warn">The photo looks like it shows a beard. <button className="linkbtn" onClick={() => onProfile({ ...profile, facialHair: 'full' })}>Set facial hair to full beard</button></p>}
          </div>

          <div className="card">
            <h3 className="card__title">What would balance your face</h3>
            <ol className="tips">
              {tips.map((t, i) => (
                <li key={i} className={`tip ${preview === t ? 'is-on' : ''}`}>
                  <button className="tip__head" onClick={() => setPreview(t.visual ? (preview === t ? null : t) : preview)} aria-pressed={preview === t}>
                    <span className="tip__area">{t.area}</span>
                    <span className="tip__title">{t.title}{t.visual ? ' ▣' : ''}</span>
                  </button>
                  <p className="small">{t.detail}</p>
                  <p className="small muted">Balances: {t.balances} · {t.evidence}</p>
                </li>
              ))}
            </ol>
            <p className="small muted">Research-backed = supported by perception studies (for example beards enlarging the perceived lower face). Convention = common stylist or optician practice.</p>
          </div>
        </>
      )}

      {sub === 'brows' && (
        <BrowStudio photo={s.photo} landmarks={s.landmarks} style={s.browStyle} onStyle={s.setBrowStyle} colours={s.colour}
          overrides={s.browOverrides} onOverrides={s.setBrowOverrides}
          startShiftMm={r ? (r.spacing.label === 'Wide-set' ? 1 : r.spacing.label === 'Close-set' ? -1 : 0) : 0}
          spacingLabel={r?.spacing.label ?? null} />
      )}

      {sub === 'progress' && (
        <div className="card">
          <h3 className="card__title">Progress over time</h3>
          {history.length === 0 && <p className="small muted">Save an analysis to start tracking. Each saved photo records your perceived thirds, eye spacing and face length-to-width, so you can see how haircuts, beard and brow changes move them.</p>}
          {history.length > 0 && (
            <table className="vtable">
              <thead><tr><th>Date</th><th>Upper / Mid / Lower</th><th>Eye gap</th><th>L : W</th></tr></thead>
              <tbody>
                {history.map((a, i) => {
                  const p = a.proportions!; const tot = p.thirds[0] + p.thirds[1] + p.thirds[2];
                  const prev = history[i - 1]?.proportions;
                  const dUp = prev ? Math.round((p.thirds[0] / tot - prev.thirds[0] / (prev.thirds[0] + prev.thirds[1] + prev.thirds[2])) * 100) : null;
                  return (
                    <tr key={a.id}>
                      <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                      <td className="mono">{p.thirds.map((t) => Math.round((t / tot) * 100)).join(' / ')}%{dUp !== null && dUp !== 0 ? <span className="muted"> (upper {dUp > 0 ? '+' : ''}{dUp})</span> : null}</td>
                      <td className="mono">{p.spacingRatio.toFixed(2)}</td>
                      <td className="mono">{p.lengthToWidth.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {history.length > 0 && <p className="small muted">Last saved {fmtDate(history[history.length - 1].createdAt)}. Compare like with like: same distance, light and expression.</p>}
        </div>
      )}
    </section>
  );
}

function Bar({ label, value, target, level, right }: { label: string; value: number; target: number; level: string; right: string }) {
  const tone = level === 'Balanced' ? 'ok' : level === 'Slightly' ? 'warn' : 'bad';
  return (
    <div className="pbar">
      <div className="pbar__top"><span>{label}</span><span className="small mono">{right}</span></div>
      <div className="pbar__track">
        <span className={`pbar__fill pbar__fill--${tone}`} style={{ width: `${Math.min(100, value * 100)}%` }} />
        <span className="pbar__target" style={{ left: `${target * 100}%` }} />
      </div>
      <span className={`small pbar__lvl fit--${tone}`}>{level}</span>
    </div>
  );
}
