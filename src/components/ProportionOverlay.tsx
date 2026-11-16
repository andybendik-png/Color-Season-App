import { useEffect, useRef, useState } from 'react';
import type { LineKey, ProportionResult } from '../engine/proportions';
import type { Pt } from '../engine/brows';
import type { Tip } from '../engine/faceStyling';

interface Props {
  photo: HTMLCanvasElement;
  lines: Record<LineKey, Pt>;
  result: ProportionResult;
  onMove: (k: LineKey, p: Pt) => void;
  visual: Tip['visual'] | null;
  show: 'thirds' | 'fifths' | 'both';
}

const V_KEYS: LineKey[] = ['hairline', 'glabella', 'subnasale', 'chin'];
const H_KEYS: LineKey[] = ['edgeL', 'exoL', 'endoL', 'endoR', 'exoR', 'edgeR'];
const LABEL: Partial<Record<LineKey, string>> = { hairline: 'Hairline (as seen)', glabella: 'Brows', subnasale: 'Nose base', chin: 'Chin (as seen)', edgeL: 'Edge', edgeR: 'Edge' };
const COL = { Balanced: '#6fbfa8', Slightly: '#e6b85c', 'Stands out': '#e2788a' } as const;

/** Photo cropped to the face with draggable thirds/fifths lines and an optional suggestion overlay. */
export function ProportionOverlay({ photo, lines, result, onMove, visual, show }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [cssW, setCssW] = useState(1);
  const drag = useRef<{ key: LineKey } | null>(null);
  const f = result.frame;
  const mmPx = 1 / result.mmPerPx;

  // Crop (image coords): around the face, generous margins for hair, beard and suggestions.
  // Computed once per photo, so the view does not shift while a line is being dragged.
  const cropKey = useRef<HTMLCanvasElement | null>(null);
  const cropRef = useRef<{ x0: number; y0: number; w: number; h: number } | null>(null);
  const computeCrop = () => {
    const L = (k: LineKey) => f.toLocal(lines[k]);
    const top = L('hairline').y - 30 * mmPx, bottom = L('chin').y + 30 * mmPx;
    const left = L('edgeL').x - 25 * mmPx, right = L('edgeR').x + 25 * mmPx;
    const corners = [{ x: left, y: top }, { x: right, y: top }, { x: left, y: bottom }, { x: right, y: bottom }].map(f.toImage);
    const x0 = Math.max(0, Math.min(...corners.map((p) => p.x))), x1 = Math.min(photo.width, Math.max(...corners.map((p) => p.x)));
    const y0 = Math.max(0, Math.min(...corners.map((p) => p.y))), y1 = Math.min(photo.height, Math.max(...corners.map((p) => p.y)));
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  };
  if (cropKey.current !== photo || !cropRef.current) { cropKey.current = photo; cropRef.current = computeCrop(); }
  const crop = cropRef.current;

  const W = 900, k = W / crop.w, H = Math.round(crop.h * k);
  const toC = (p: Pt) => ({ x: (p.x - crop.x0) * k, y: (p.y - crop.y0) * k });

  useEffect(() => {
    const ro = new ResizeObserver(() => setCssW(box.current?.clientWidth ?? 1));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current!; c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(photo, crop.x0, crop.y0, crop.w, crop.h, 0, 0, W, H);
    const L = (key: LineKey) => f.toLocal(lines[key]);
    const xL = L('edgeL').x - 10 * mmPx, xR = L('edgeR').x + 10 * mmPx;
    const seg = (a: Pt, b: Pt, col: string, w = 3, dash: number[] = []) => {
      const p = toC(f.toImage(a)), q = toC(f.toImage(b));
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.restore();
    };
    const poly = (pts: Pt[], fill: string, stroke: string) => {
      const q = pts.map((p) => toC(f.toImage(p)));
      ctx.save(); ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    };
    const text = (s: string, at: Pt, col = '#fff', size = 24) => {
      const p = toC(f.toImage(at));
      ctx.save(); ctx.font = `700 ${size}px -apple-system, sans-serif`; ctx.fillStyle = col; ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 5;
      ctx.fillText(s, p.x, p.y); ctx.restore();
    };

    // Suggestion overlay first (under the lines)
    if (visual) {
      const mm = Math.max(3, Math.min(60, visual.mm)) * mmPx;
      const hl = L('hairline'), ch = L('chin'), g = L('glabella');
      const fx0 = L('exoL').x - 4 * mmPx, fx1 = L('exoR').x + 4 * mmPx;
      const tint = 'rgba(120, 95, 80, .45)', edge = '#fff';
      if (visual.kind === 'fringe') poly([{ x: fx0, y: hl.y - 4 * mmPx }, { x: fx1, y: hl.y - 4 * mmPx }, { x: fx1, y: Math.min(hl.y + mm, g.y - 6 * mmPx) }, { x: fx0, y: Math.min(hl.y + mm, g.y - 6 * mmPx) }], tint, edge);
      if (visual.kind === 'top-volume') poly([{ x: fx0, y: hl.y }, { x: fx1, y: hl.y }, { x: (fx0 + fx1) / 2 + 10 * mmPx, y: hl.y - mm }, { x: (fx0 + fx1) / 2 - 10 * mmPx, y: hl.y - mm }], tint, edge);
      if (visual.kind === 'beard-chin') { const w = (L('endoR').x - L('endoL').x) * 0.9; poly([{ x: g.x - w, y: ch.y - 6 * mmPx }, { x: g.x + w, y: ch.y - 6 * mmPx }, { x: g.x + w * 0.6, y: ch.y + mm }, { x: g.x - w * 0.6, y: ch.y + mm }], tint, edge); }
      if (visual.kind === 'beard-trim') { const w = (L('endoR').x - L('endoL').x) * 1.1; poly([{ x: g.x - w, y: ch.y - Math.min(mm, 25 * mmPx) }, { x: g.x + w, y: ch.y - Math.min(mm, 25 * mmPx) }, { x: g.x + w, y: ch.y }, { x: g.x - w, y: ch.y }], 'rgba(226,120,138,.35)', edge); }
      if (visual.kind === 'side-volume' || visual.kind === 'side-tight') {
        const sgn = visual.kind === 'side-volume' ? 1 : -1;
        for (const [ek, dir] of [['edgeL', -1], ['edgeR', 1]] as const) {
          const e = L(ek);
          poly([{ x: e.x, y: hl.y + 8 * mmPx }, { x: e.x + dir * sgn * mm, y: hl.y + 14 * mmPx }, { x: e.x + dir * sgn * mm, y: e.y + 10 * mmPx }, { x: e.x, y: e.y + 16 * mmPx }],
            visual.kind === 'side-volume' ? tint : 'rgba(226,120,138,.35)', edge);
        }
      }
    }

    if (show !== 'fifths') {
      const [up, mid, low] = result.thirds;
      const bounds: [LineKey, LineKey, typeof up][] = [['hairline', 'glabella', up], ['glabella', 'subnasale', mid], ['subnasale', 'chin', low]];
      for (const key of V_KEYS) seg({ x: xL, y: L(key).y }, { x: xR, y: L(key).y }, '#ffffff', 3);
      for (const [a, b, t] of bounds) {
        const ya = L(a).y, yb = L(b).y;
        seg({ x: xR + 4 * mmPx, y: ya }, { x: xR + 4 * mmPx, y: yb }, COL[t.level], 7);
        text(`${Math.round(t.share * 100)}%`, { x: xR + 7 * mmPx, y: (ya + yb) / 2 + 3 * mmPx }, COL[t.level]);
      }
      seg({ x: L('glabella').x - 12 * mmPx, y: L('stomion').y }, { x: L('glabella').x + 12 * mmPx, y: L('stomion').y }, 'rgba(255,255,255,.7)', 2, [6, 6]);
    }
    if (show !== 'thirds') {
      const yTop = L('glabella').y - 6 * mmPx, yBot = L('subnasale').y;
      H_KEYS.forEach((key) => seg({ x: L(key).x, y: yTop }, { x: L(key).x, y: yBot }, key.startsWith('edge') ? 'rgba(255,255,255,.85)' : '#ffffff', 3, key.startsWith('edge') ? [8, 6] : []));
      const gapCol = COL[result.spacing.level];
      seg({ x: L('endoL').x, y: yBot - 4 * mmPx }, { x: L('endoR').x, y: yBot - 4 * mmPx }, gapCol, 6);
      result.fifths.forEach((fi, i) => {
        const xa = L(H_KEYS[i]).x, xb = L(H_KEYS[i + 1]).x;
        text(fi.ratioToEye.toFixed(2), { x: (xa + xb) / 2 - 5 * mmPx, y: yTop - 2 * mmPx }, fi.key === 'gap' ? gapCol : '#fff', 20);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, lines, result, visual, show, crop, W, H, k]);

  const scale = cssW / W;
  const handles = (show === 'thirds' ? V_KEYS : show === 'fifths' ? H_KEYS : [...V_KEYS, 'edgeL', 'edgeR'] as LineKey[]);
  const down = (key: LineKey) => (e: React.PointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { key }; };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = box.current!.getBoundingClientRect();
    const img = { x: (e.clientX - rect.left) / scale / k + crop.x0, y: (e.clientY - rect.top) / scale / k + crop.y0 };
    const key = drag.current.key;
    const cur = f.toLocal(lines[key]), nl = f.toLocal(img);
    // Thirds lines move vertically only; fifths lines horizontally only.
    onMove(key, f.toImage(V_KEYS.includes(key) || key === 'stomion' ? { x: cur.x, y: nl.y } : { x: nl.x, y: cur.y }));
  };
  const up = () => { drag.current = null; };

  return (
    <div className="pover" ref={box} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <canvas ref={canvas} className="pover__img" />
      {handles.map((key) => {
        const L = f.toLocal(lines[key]);
        const anchor = V_KEYS.includes(key) ? { x: f.toLocal(lines.edgeL).x - 6 * mmPx, y: L.y } : { x: L.x, y: f.toLocal(lines.subnasale).y + 4 * mmPx };
        const p = toC(f.toImage(anchor));
        return (
          <div key={key} className={`phandle ${V_KEYS.includes(key) ? 'phandle--v' : 'phandle--h'}`} style={{ left: p.x * scale, top: p.y * scale }}
            onPointerDown={down(key)} role="slider" aria-label={`Move ${LABEL[key] ?? key} line`} aria-valuenow={Math.round(L.y)} tabIndex={0}>
            <span className="phandle__label">{LABEL[key] ?? ''}</span>
          </div>
        );
      })}
    </div>
  );
}
