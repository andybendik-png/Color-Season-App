import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultPoints, detectLandmarks, pointsFromLandmarks, type PointKey, type SamplePoint } from '../engine/faceLandmarks';
import { analysePerson, combineWithDraping, type PersonalAnalysis } from '../engine/faceAnalysis';
import { sampleAnnulus, sampleCircle } from '../engine/sampling';
import type { BrowStyle, Pt } from '../engine/brows';
import type { Vec3 } from '../engine/colourConversion';
import type { DrapeAnswers, SavedAnalysis } from '../storage/analyses';
import { uid } from '../storage/database';
import { PhotoMarkers } from './PhotoMarkers';
import { DrapeTest } from './DrapeTest';
import { BrowStudio } from './BrowStudio';
import { fmt, fmtDate } from './format';

type Sub = 'colour' | 'drape' | 'brows';
const MAX_SIDE = 1200;
const NO_DRAPE: DrapeAnswers = { clarity: null, temperature: null, value: null };

interface Props {
  saved: SavedAnalysis[];
  onSave: (a: SavedAnalysis) => Promise<void>;
  onDelete: (id: string) => void;
  signedIn: boolean;
}

async function loadImage(src: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function samplePoints(canvas: HTMLCanvasElement, pts: Record<PointKey, SamplePoint>, useWhite: boolean) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)!;
  const at = (p: SamplePoint, ring = false): Vec3 | null => {
    const r = Math.max(2, Math.round(p.r));
    const x0 = Math.max(0, Math.round(p.x - r)), y0 = Math.max(0, Math.round(p.y - r));
    const w = Math.min(canvas.width - x0, 2 * r + 1), h = Math.min(canvas.height - y0, 2 * r + 1);
    if (w < 2 || h < 2) return null;
    const d = ctx.getImageData(x0, y0, w, h).data;
    const res = ring ? sampleAnnulus(d, w, h, p.x - x0, p.y - y0, r) : sampleCircle(d, w, h, p.x - x0, p.y - y0, r);
    return res?.srgb ?? null;
  };
  const list = (keys: PointKey[], ring = false) => keys.map((k) => at(pts[k], ring)).filter(Boolean) as Vec3[];
  return {
    skin: list(['cheekL', 'cheekR', 'forehead', 'chin']), hair: list(['hairTop', 'hairSide']),
    eyes: list(['eyeL', 'eyeR'], true), brows: list(['browL', 'browR']), white: useWhite ? at(pts.white) : null,
  };
}

export function SelfieStudio({ saved, onSave, onDelete, signedIn }: Props) {
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [points, setPoints] = useState<Record<PointKey, SamplePoint> | null>(null);
  const [landmarks, setLandmarks] = useState<Pt[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [useWhite, setUseWhite] = useState(false);
  const [sub, setSub] = useState<Sub>('colour');
  const [drape, setDrape] = useState<DrapeAnswers>(NO_DRAPE);
  const [browStyle, setBrowStyle] = useState<BrowStyle>('soft');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null), camRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (src: string, preset?: SavedAnalysis) => {
    setStatus('Loading photo…');
    const c = await loadImage(src);
    setPhoto(c); setSub('colour');
    if (preset) {
      setPoints(preset.points); setUseWhite(preset.useWhite); setDrape(preset.drape); setBrowStyle(preset.browStyle); setCurrentId(preset.id);
      const lm = preset.landmarks; const k = c.width / preset.width;
      setLandmarks(lm ? Array.from({ length: lm.length / 2 }, (_, i) => ({ x: lm[2 * i] * k, y: lm[2 * i + 1] * k })) : null);
      setStatus(null);
      return;
    }
    setCurrentId(null); setDrape(NO_DRAPE); setLandmarks(null);
    setPoints(defaultPoints(c.width, c.height));
    setStatus('Finding your face on the device…');
    try {
      const lm = await detectLandmarks(c);
      if (lm) { setLandmarks(lm); setPoints(pointsFromLandmarks(lm)); setStatus('Face found. Drag any point that missed its target.'); }
      else setStatus('No face found. Drag the points onto your cheeks, forehead, chin, hair and irises.');
    } catch (e) {
      setStatus(`${e instanceof Error ? e.message : 'Face detection unavailable.'} Drag the points into place.`);
    }
  }, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    try { await open(url); } catch { setStatus('That file could not be opened as an image.'); } finally { URL.revokeObjectURL(url); }
  };

  const analysis: PersonalAnalysis | null = useMemo(() => {
    if (!photo || !points) return null;
    try { return analysePerson(samplePoints(photo, points, useWhite)); } catch { return null; }
  }, [photo, points, useWhite]);
  const combined = useMemo(() => (analysis && (drape.clarity !== null || drape.temperature !== null || drape.value !== null) ? combineWithDraping(analysis, drape) : null), [analysis, drape]);

  const faceBox = useMemo(() => {
    if (!points) return null;
    const xs = [points.cheekL.x, points.cheekR.x], ys = [points.forehead.y, points.chin.y];
    const w = Math.abs(xs[1] - xs[0]) * 1.6, h = Math.abs(ys[1] - ys[0]) * 1.5;
    return { x: (xs[0] + xs[1]) / 2 - w / 2, y: ys[0] - h * 0.2, w, h };
  }, [points]);

  const save = async () => {
    if (!photo || !points || !analysis) return;
    setSaving(true);
    const k = Math.min(1, 900 / Math.max(photo.width, photo.height));
    const c = document.createElement('canvas'); c.width = Math.round(photo.width * k); c.height = Math.round(photo.height * k);
    c.getContext('2d')!.drawImage(photo, 0, 0, c.width, c.height);
    const scalePts = Object.fromEntries(Object.entries(points).map(([key, p]) => [key, { ...p, x: p.x * k, y: p.y * k, r: p.r * k }])) as Record<PointKey, SamplePoint>;
    const now = Date.now();
    const rec: SavedAnalysis = {
      id: currentId ?? uid(), createdAt: saved.find((s) => s.id === currentId)?.createdAt ?? now, updatedAt: now,
      name: `Analysis ${new Date(now).toLocaleDateString()}`, photo: c.toDataURL('image/jpeg', 0.82), width: c.width, height: c.height,
      points: scalePts, useWhite, landmarks: landmarks ? landmarks.flatMap((p) => [p.x * k, p.y * k]) : null, browStyle, drape,
      summary: { topSeason: analysis.ranking[0].name, topSeasonId: analysis.ranking[0].id, confidence: analysis.confidence, dominant: analysis.dominant, secondary: analysis.secondary, combinedTop: combined?.[0].name },
    };
    await onSave(rec);
    setCurrentId(rec.id); setSaving(false);
  };

  useEffect(() => { if (!photo) setStatus(null); }, [photo]);

  return (
    <section className="selfie">
      {!photo && (
        <>
          <div className="card prose">
            <h3 className="card__title">Find your season from a photo</h3>
            <p>The app measures your skin, hair and eye colours on this device, estimates warm/cool, light/deep and soft/clear, and ranks the 12 seasons. You can then check the result with a virtual drape test and get an eyebrow map.</p>
            <p><strong>For a usable photo:</strong></p>
            <ol>
              <li>Face a window in daylight, with no direct sun and no lamps on.</li>
              <li>Remove makeup, turn off filters and beauty mode, and pull your hair back from your face.</li>
              <li>Wear white or grey and use a plain background. Coloured clothing reflects onto the skin.</li>
              <li>Hold a sheet of white paper under your chin. You'll mark it as a white reference to remove the colour cast.</li>
              <li>Look straight at the camera with your face level and forehead visible (needed for the brow map).</li>
            </ol>
            <p className="small muted">Even under ideal light, studios testing selfie-based apps got the right broad season only about half the time. In-person draping in daylight is still the reference method. Use this as a guide.</p>
          </div>
          <div className="row gap">
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => camRef.current?.click()}>Take a selfie</button>
            <button className="btn" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>Choose a photo</button>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {saved.length > 0 && (
            <div className="card">
              <h3 className="card__title">Saved analyses</h3>
              <ul className="alist">
                {saved.map((s) => (
                  <li key={s.id}>
                    <button className="alist__open" onClick={() => open(s.photo, s)}>
                      <img src={s.photo} alt="" />
                      <span><strong>{s.summary.combinedTop ?? s.summary.topSeason}</strong><br /><span className="small muted">{s.summary.dominant} · {s.summary.secondary} · confidence {s.summary.confidence.toLowerCase()} · {fmtDate(s.createdAt)}</span></span>
                    </button>
                    <button className="iconbtn iconbtn--danger" onClick={() => { if (confirm('Delete this analysis and its photo?')) onDelete(s.id); }} aria-label="Delete analysis">✕</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="small muted center">{signedIn ? 'Saved analyses, including photos, sync to your account.' : 'Saved analyses stay on this device. Sign in to sync them, including photos, to your account.'}</p>
        </>
      )}

      {photo && points && (
        <>
          <div className="row gap">
            <button className="btn" onClick={() => { setPhoto(null); setPoints(null); setLandmarks(null); }}>← New photo</button>
            <button className="btn btn--primary" style={{ flex: 1 }} onClick={save} disabled={!analysis || saving}>{saving ? 'Saving…' : currentId ? 'Update saved analysis' : 'Save analysis'}</button>
          </div>
          {status && <p className="small muted" role="status">{status}</p>}
          <PhotoMarkers canvas={photo} points={points} showWhite={useWhite} onChange={(k, p) => setPoints((prev) => (prev ? { ...prev, [k]: p } : prev))} />
          <label className="check"><input type="checkbox" checked={useWhite} onChange={(e) => setUseWhite(e.target.checked)} /> There's something white in the photo (paper, white top). Drag the “White” point onto it.</label>

          <div className="seg" role="group" aria-label="Section">
            <button className={`seg__btn ${sub === 'colour' ? 'is-on' : ''}`} onClick={() => setSub('colour')}>Colouring</button>
            <button className={`seg__btn ${sub === 'drape' ? 'is-on' : ''}`} onClick={() => setSub('drape')}>Drape test</button>
            <button className={`seg__btn ${sub === 'brows' ? 'is-on' : ''}`} onClick={() => setSub('brows')}>Brows</button>
          </div>

          {sub === 'colour' && analysis && <PersonResult a={analysis} combined={combined} />}
          {sub === 'drape' && faceBox && <DrapeTest photo={photo} chinY={points.chin.y + Math.abs(points.chin.y - points.cheekL.y) * 0.3} faceBox={faceBox} initial={drape} onDone={(d) => { setDrape(d); }} />}
          {sub === 'brows' && <BrowStudio photo={photo} landmarks={landmarks} style={browStyle} onStyle={setBrowStyle} colours={analysis} />}
        </>
      )}
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
