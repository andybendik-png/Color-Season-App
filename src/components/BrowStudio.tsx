import { useEffect, useMemo, useRef, useState } from 'react';
import { analyseBrows, inside, outline, yAt, type BrowStyle, type Pt, type BrowAnalysis } from '../engine/brows';
import { describeSrgb, labToXyz, xyzToLinearRgb, linearToSrgb, srgbToHex, labToLch, type Lab, type Vec3 } from '../engine/colourConversion';
import type { PersonalAnalysis } from '../engine/faceAnalysis';

interface Props { photo: HTMLCanvasElement; landmarks: Pt[] | null; style: BrowStyle; onStyle: (s: BrowStyle) => void; colours: PersonalAnalysis | null }
type View = 'guides' | 'after' | 'before';

interface Masks { trim: Uint8Array; fill: Uint8Array; hair: Uint8Array; x0: number; y0: number; w: number; h: number; trimMm2: number; fillMm2: number; skin: Vec3; brow: Vec3 }

function labToHex(l: Lab) { return srgbToHex(linearToSrgb(xyzToLinearRgb(labToXyz(l)))); }

/** Classify pixels around each brow: hair outside the ideal shape = trim; ideal area without hair = fill. */
function computeMasks(photo: HTMLCanvasElement, a: BrowAnalysis): Masks | null {
  const pts: Pt[] = [];
  for (const s of a.sides) {
    const mmPx = 1 / a.mmPerPx;
    const xs = [s.ideal.start.x, s.ideal.tail.x, s.current.start.x, s.current.tail.x];
    const ys = [...s.ideal.upper.map((p) => p.y), ...s.current.upper.map((p) => p.y)];
    const xMin = Math.min(...xs) - 6 * mmPx, xMax = Math.max(...xs) + 4 * mmPx;
    const lows = [...s.ideal.lower.map((p) => p.y), ...s.current.lower.map((p) => p.y)];
    const yMin = Math.min(...ys) - 3 * mmPx, yMax = Math.min(s.iris.c.y - s.iris.r * 1.5, Math.max(...lows) + 3 * mmPx);
    for (const p of [{ x: xMin, y: yMin }, { x: xMax, y: yMin }, { x: xMin, y: yMax }, { x: xMax, y: yMax }]) pts.push(a.frame.toImage(p));
  }
  const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)))), x1 = Math.min(photo.width - 1, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)))), y1 = Math.min(photo.height - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w < 10 || h < 10) return null;
  const data = photo.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)!.getImageData(x0, y0, w, h).data;
  const lum = (i: number) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const trim = new Uint8Array(w * h), fill = new Uint8Array(w * h), hairM = new Uint8Array(w * h);
  let trimN = 0, fillN = 0;
  const skinPx: number[][] = [], browPx: number[][] = [];
  for (const s of a.sides) {
    const ideal = outline(s.ideal.upper, s.ideal.lower);
    const cur = outline(s.current.upper, s.current.lower);
    const mmPx = 1 / a.mmPerPx;
    const xs = [s.ideal.start.x, s.ideal.tail.x, s.current.start.x, s.current.tail.x];
    const ys = [...s.ideal.upper.map((p) => p.y), ...s.current.upper.map((p) => p.y)];
    const lx0 = Math.min(...xs) - 6 * mmPx, lx1 = Math.max(...xs) + 4 * mmPx;
    const lows = [...s.ideal.lower.map((p) => p.y), ...s.current.lower.map((p) => p.y)];
    const ly0 = Math.min(...ys) - 3 * mmPx, ly1 = Math.min(s.iris.c.y - s.iris.r * 1.5, Math.max(...lows) + 3 * mmPx);
    // reference luminances: inside current brow vs band of skin above it
    const inL: number[] = [], outL: number[] = [];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const L = a.frame.toLocal({ x: x + x0, y: y + y0 });
      if (L.x < lx0 || L.x > lx1 || L.y < ly0 || L.y > ly1) continue;
      const i = (y * w + x) * 4;
      const top = Math.min(yAt(s.current.upper, L.x) ?? Infinity, yAt(s.ideal.upper, L.x) ?? Infinity);
      if (inside(cur, L)) inL.push(lum(i));
      else if (Number.isFinite(top) && L.y < top - 1 * mmPx) outL.push(lum(i)); // forehead skin above the brow only (eye-socket shadow excluded)
    }
    if (inL.length < 10 || outL.length < 10) continue;
    inL.sort((p, q) => p - q); outL.sort((p, q) => p - q);
    const browY = inL[Math.floor(inL.length * 0.35)], skinY = outL[Math.floor(outL.length * 0.6)];
    if (skinY - browY < 8) continue; // brows too faint to separate from skin in this photo
    const thr = browY + 0.42 * (skinY - browY);
    const lowerAt = (x: number) => Math.max(yAt(s.current.lower, x) ?? -Infinity, yAt(s.ideal.lower, x) ?? -Infinity);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const L = a.frame.toLocal({ x: x + x0, y: y + y0 });
      if (L.x < lx0 || L.x > lx1 || L.y < ly0 || L.y > ly1) continue;
      const i = (y * w + x) * 4;
      // below the brow, only pixels within ~1.5 mm of the lower edge count as stray hairs (deeper = eye-socket shadow)
      const lo = lowerAt(L.x);
      const hair = lum(i) < thr && !(Number.isFinite(lo) && L.y > lo + 1.5 * mmPx);
      if (hair) hairM[y * w + x] = 1;
      const inIdeal = inside(ideal, L);
      if (hair && !inIdeal) { trim[y * w + x] = 1; trimN++; }
      if (!hair && inIdeal) { fill[y * w + x] = 1; fillN++; }
      if (hair && inIdeal) browPx.push([data[i], data[i + 1], data[i + 2]]);
      if (!hair && !inIdeal && skinPx.length < 4000) skinPx.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (!skinPx.length) return null;
  const med = (arr: number[][], k: number) => { const s = arr.map((p) => p[k]).sort((p, q) => p - q); return s[s.length >> 1] / 255; };
  const skin: Vec3 = [med(skinPx, 0), med(skinPx, 1), med(skinPx, 2)];
  const brow: Vec3 = browPx.length ? [med(browPx, 0), med(browPx, 1), med(browPx, 2)] : [0.3, 0.27, 0.25];
  const mm2 = a.mmPerPx * a.mmPerPx;
  return { trim, fill, hair: hairM, x0, y0, w, h, trimMm2: trimN * mm2, fillMm2: fillN * mm2, skin, brow };
}

export function BrowStudio({ photo, landmarks, style, onStyle, colours }: Props) {
  const [view, setView] = useState<View>('guides');
  const out = useRef<HTMLCanvasElement>(null);
  const analysis = useMemo(() => (landmarks ? analyseBrows(landmarks, style) : null), [landmarks, style]);
  const masks = useMemo(() => (analysis ? computeMasks(photo, analysis) : null), [photo, analysis]);

  useEffect(() => {
    if (!analysis || !out.current) return;
    // crop: both brows + eyes, with margins
    const all = analysis.sides.flatMap((s) => [...s.ideal.upper, ...s.current.upper, s.iris.c].map((p) => analysis.frame.toImage(p)));
    const pad = 14 / analysis.mmPerPx;
    const cx0 = Math.max(0, Math.min(...all.map((p) => p.x)) - pad), cx1 = Math.min(photo.width, Math.max(...all.map((p) => p.x)) + pad);
    const cy0 = Math.max(0, Math.min(...all.map((p) => p.y)) - pad), cy1 = Math.min(photo.height, Math.max(...all.map((p) => p.y)) + pad * 0.8);
    const W = 900, k = W / (cx1 - cx0), H = Math.round((cy1 - cy0) * k);
    const c = out.current; c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    // compose the working image (before/after) at photo resolution
    const work = document.createElement('canvas'); work.width = photo.width; work.height = photo.height;
    const wctx = work.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)!;
    wctx.drawImage(photo, 0, 0);
    if (masks && view !== 'before') {
      const img = wctx.getImageData(masks.x0, masks.y0, masks.w, masks.h);
      const d = img.data;
      const orig = new Uint8ClampedArray(d);
      for (let j = 0; j < masks.w * masks.h; j++) {
        const i = j * 4;
        if (view === 'after') {
          if (masks.trim[j]) {
            // inpaint: take the nearest pixel above/below that is neither hair-to-trim nor brow
            const x = j % masks.w, y = (j / masks.w) | 0;
            let src = -1;
            for (let k = 1; k < 40 && src < 0; k++) {
              for (const yy of [y - k, y + k]) {
                if (yy < 0 || yy >= masks.h) continue;
                const jj = yy * masks.w + x;
                if (!masks.trim[jj] && !masks.fill[jj] && !masks.hair[jj]) { src = jj; break; }
              }
            }
            const si = src >= 0 ? src * 4 : -1;
            const sk = si >= 0 ? [orig[si], orig[si + 1], orig[si + 2]] : masks.skin.map((c) => c * 255);
            d[i] = sk[0]; d[i + 1] = sk[1]; d[i + 2] = sk[2];
          } else if (masks.fill[j]) {
            // hair-like strokes rather than a solid block
            const x = j % masks.w, y = (j / masks.w) | 0;
            const L = analysis.frame.toLocal({ x: x + masks.x0, y: y + masks.y0 });
            const st = analysis.mmPerPx > 0 ? (L.x * 0.55 + L.y) * analysis.mmPerPx : 0; // strokes slanting along the brow
            const a = ((st % 0.9) + 0.9) % 0.9 < 0.35 ? 0.55 : 0.18;
            d[i] = d[i] * (1 - a) + masks.brow[0] * 255 * a; d[i + 1] = d[i + 1] * (1 - a) + masks.brow[1] * 255 * a; d[i + 2] = d[i + 2] * (1 - a) + masks.brow[2] * 255 * a;
          }
        } else {
          if (masks.trim[j]) { d[i] = d[i] * 0.45 + 220 * 0.55; d[i + 1] = d[i + 1] * 0.45 + 60 * 0.55; d[i + 2] = d[i + 2] * 0.45 + 80 * 0.55; }
          else if (masks.fill[j]) { d[i] = d[i] * 0.6 + 70 * 0.4; d[i + 1] = d[i + 1] * 0.6 + 170 * 0.4; d[i + 2] = d[i + 2] * 0.6 + 130 * 0.4; }
        }
      }
      wctx.putImageData(img, masks.x0, masks.y0);
    }
    ctx.drawImage(work, cx0, cy0, cx1 - cx0, cy1 - cy0, 0, 0, W, H);
    if (view !== 'guides') return;
    const T = (p: Pt) => { const q = analysis.frame.toImage(p); return { x: (q.x - cx0) * k, y: (q.y - cy0) * k }; };
    const line = (a: Pt, b: Pt, col: string, dash: number[] = []) => {
      const p = T(a), q = T(b); ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.restore();
    };
    for (const s of analysis.sides) {
      line({ x: s.ideal.start.x, y: s.guides.ala.y }, s.guides.startTop, 'rgba(255,255,255,.85)', [6, 6]);
      line(s.guides.peakLine[0], s.guides.peakLine[1], 'rgba(255,255,255,.6)', [3, 6]);
      line(s.guides.tailLine[0], s.guides.tailLine[1], 'rgba(255,255,255,.85)', [6, 6]);
      const poly = outline(s.ideal.upper, s.ideal.lower).map(T);
      ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
      ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke(); ctx.restore();
      for (const [p, label] of [[s.ideal.start, 'Start'], [s.ideal.peak, 'Peak'], [s.ideal.tail, 'Tail']] as [Pt, string][]) {
        const q = T(p); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.font = '600 20px -apple-system, sans-serif'; ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 4;
        ctx.fillText(label, q.x - 18, q.y - 12); ctx.shadowBlur = 0;
      }
    }
  }, [analysis, masks, view, photo]);

  if (!landmarks) return (
    <div className="card"><h3 className="card__title">Brows</h3>
      <p className="small">Brow mapping needs the automatic face landmarks (eyes, iris and nose), and they weren't found in this photo. Try a straight-on photo with your forehead visible and your hair pulled back.</p></div>
  );
  if (!analysis) return null;

  const pencil = (() => {
    if (!colours) return null;
    const hair = colours.hair.lab;
    const targetL = hair.L < 45 ? hair.L + 5 : hair.L - 6; // one shade lighter than dark hair, a touch darker than light hair
    const lch = labToLch(hair);
    const cool = colours.dims.temperature < 0;
    const C = Math.min(lch.C, cool ? 6 : 14);
    const h = cool ? 70 : Math.max(55, Math.min(75, lch.h));
    const lab: Lab = { L: targetL, a: C * Math.cos((h * Math.PI) / 180), b: C * Math.sin((h * Math.PI) / 180) };
    return { hex: labToHex(lab), tone: cool ? 'ash / cool taupe' : 'soft warm brown / warm taupe', current: describeSrgb(colours.brows?.srgb ?? colours.hair.srgb).hex };
  })();

  const [sA, sB] = analysis.sides;
  return (
    <section className="brows">
      <div className="card">
        <h3 className="card__title">Eyebrow map</h3>
        <div className="seg seg--small" role="group" aria-label="Brow style">
          {([['soft', 'Soft arch'], ['defined', 'Defined arch'], ['straight', 'Straight & full']] as [BrowStyle, string][]).map(([k, l]) => (
            <button key={k} className={`seg__btn ${style === k ? 'is-on' : ''}`} onClick={() => onStyle(k)}>{l}</button>
          ))}
        </div>
        <canvas ref={out} className="brows__canvas" />
        <div className="seg seg--small" role="group" aria-label="View">
          {([['guides', 'Map'], ['after', 'After (simulated)'], ['before', 'Before']] as [View, string][]).map(([k, l]) => (
            <button key={k} className={`seg__btn ${view === k ? 'is-on' : ''}`} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        {view === 'guides' && <p className="small"><span className="key key--trim" /> trim / tweeze · <span className="key key--fill" /> fill with pencil or powder · white outline = suggested shape</p>}
        {!masks && <p className="small warn">The brow hairs could not be separated from the skin in this photo (low contrast or soft focus), so only the outline is shown.</p>}
        {masks && <p className="small muted">About {masks.trimMm2.toFixed(0)} mm² to remove and {masks.fillMm2.toFixed(0)} mm² to fill, across both brows.</p>}
        <p className="small muted">Works best on a sharp, straight-on photo in even light, with brows visible. Face shape estimate: {analysis.faceShape}. {analysis.summary.join(' ')} Millimetres are approximate (scaled from the iris, ≈11.7 mm).</p>
      </div>
      {[sA, sB].map((s) => (
        <div className="card" key={s.side}>
          <h3 className="card__title">Brow on the {s.side === 'A' ? 'left' : 'right'} of the photo</h3>
          <ol className="small advice">{s.advice.map((t, i) => <li key={i}>{t}</li>)}</ol>
          <p className="small muted">Length ≈ {s.metrics.lengthMm.toFixed(0)} mm · thickness ≈ {s.metrics.thicknessMm.toFixed(0)} mm</p>
        </div>
      ))}
      <div className="card">
        <h3 className="card__title">Symmetry and colour</h3>
        <ul className="small">{analysis.symmetry.map((t, i) => <li key={i}>{t}</li>)}</ul>
        {pencil && (
          <p className="small"><span className="sw" style={{ background: pencil.hex }} />Pencil or powder around <span className="mono">{pencil.hex}</span>: {pencil.tone}. Current brow reads <span className="sw" style={{ background: pencil.current }} /><span className="mono">{pencil.current}</span>.</p>
        )}
        <ol className="small">
          <li>Brush the hairs up with a spoolie before trimming.</li>
          <li>Trim only the hairs that extend above the top line once brushed up.</li>
          <li>Tweeze stray hairs one at a time, from below the brow, in the direction of growth.</li>
          <li>Stop and check both sides in a mirror every few hairs. Removed hairs take weeks to grow back.</li>
        </ol>
        <p className="small muted">These guidelines come from classic brow mapping and studies of preferred brow position. Studies show real variation by age, sex and ethnicity, so treat this as a starting point.</p>
      </div>
    </section>
  );
}
