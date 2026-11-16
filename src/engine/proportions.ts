/**
 * Perceived facial thirds and fifths from one frontal photo.
 *
 * Definitions (see project doc "research-facial-proportions"):
 *   Upper third  = hairline (trichion, as SEEN: a fringe counts) → glabella
 *   Middle third = glabella → subnasale
 *   Lower third  = subnasale → chin (menton, as SEEN: a beard counts)
 *   Fifths at eye level: visible face edge | eye | inner-eye gap | eye | visible face edge.
 *   The face mesh has no ears, so the outer two are "visible width", not the classic ear-helix fifths.
 *
 * Everything is measured in a roll-levelled frame (line through the irises = horizontal) and
 * converted to approximate millimetres with the iris diameter (≈ 11.7 mm).
 * The neoclassical canons are conventions, not norms most faces meet, so tolerances are wide
 * and there is no attractiveness score.
 */
import { makeFrame, IRIS_DIAMETER_MM, type Frame, type Pt } from './brows';

export type LineKey = 'hairline' | 'glabella' | 'subnasale' | 'stomion' | 'chin' | 'edgeL' | 'edgeR' | 'exoL' | 'endoL' | 'endoR' | 'exoR';
export type Level = 'Balanced' | 'Slightly' | 'Stands out';

export const LM_P = {
  glabella: 9, subnasale: 2, stomionU: 13, stomionL: 14, menton: 152, top: 10,
  exoA: 33, endoA: 133, endoB: 362, exoB: 263, contourA: 127, contourB: 356,
  alaA: 129, alaB: 358, mouthA: 61, mouthB: 291, irisA: 468, irisB: 473,
};

export interface Pose { yaw: number; pitch: number; roll: number }

/** Euler angles (degrees) from MediaPipe's column-major 4×4 facial transformation matrix. */
export function poseFromMatrix(m: ArrayLike<number>): Pose {
  const r00 = m[0], r10 = m[1], r20 = m[2], r21 = m[6], r22 = m[10];
  const deg = 180 / Math.PI;
  return {
    pitch: Math.atan2(r21, r22) * deg,
    yaw: Math.atan2(-r20, Math.hypot(r21, r22)) * deg,
    roll: Math.atan2(r10, r00) * deg,
  };
}

export interface Detected { hairline?: Pt; chin?: Pt; edgeL?: Pt; edgeR?: Pt; hairlineFound: boolean; beardFound: boolean; edgesFound: boolean }

/** Pixel accessor: returns [r, g, b] 0..255 or null outside the image. */
export type PixelFn = (x: number, y: number) => [number, number, number] | null;

function lab(rgb: [number, number, number]) {
  // fast sRGB → CIELAB (D65) for edge walking
  const lin = rgb.map((c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  const X = (0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2]) / 0.95047;
  const Y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.072175 * lin[2];
  const Z = (0.0193339 * lin[0] + 0.119192 * lin[1] + 0.9503041 * lin[2]) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const dE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Average colour of a small square (in image coords). */
function patch(px: PixelFn, p: Pt, r: number): number[] | null {
  let n = 0; const acc = [0, 0, 0];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const c = px(Math.round(p.x + dx), Math.round(p.y + dy));
    if (!c) continue;
    const l = lab(c); acc[0] += l[0]; acc[1] += l[1]; acc[2] += l[2]; n++;
  }
  return n ? acc.map((v) => v / n) : null;
}

/**
 * Profile the colour along a ray from `start` (unit `dir`, local frame) and return the first
 * strong colour edge: the first position where colour k pixels ahead differs by more than `thr`
 * ΔE, refined back to where the change starts. Smooth shading gradients (a few ΔE per
 * k pixels) never trigger it; a change of material (skin → hair, skin → background) does, even
 * when it is soft. Returns the edge point (image coords) or null.
 */
const JND = 4; // ≈ just-noticeable colour difference (ΔE76)

function firstEdge(px: PixelFn, f: Frame, start: Pt, dir: Pt, maxPx: number, k: number, thr: number, r: number): Pt | null {
  const s = f.toLocal(start);
  const prof: number[][] = [];
  for (let t = 0; t <= maxPx + k; t++) {
    const c = patch(px, f.toImage({ x: s.x + dir.x * t, y: s.y + dir.y * t }), r);
    if (!c) break;
    prof.push(c);
  }
  for (let t = 0; t + k < prof.length; t++) {
    if (dE(prof[t], prof[t + k]) <= thr) continue;
    // The edge is where the colour first starts to leave the "inside" colour (start of the transition),
    // not the middle of it: that is where the skin visibly ends.
    let at = t + k;
    for (let u = t + 1; u <= t + k; u++) if (dE(prof[u], prof[t]) > JND) { at = u; break; }
    return f.toImage({ x: s.x + dir.x * at, y: s.y + dir.y * at });
  }
  return null;
}

/**
 * Finds the perceived hairline (top of visible forehead skin), the perceived chin (bottom of
 * skin or beard) and the visible face edges at eye level, by colour continuity.
 */
export function detectEdges(lm: Pt[], px: PixelFn): Detected {
  const f = makeFrame(lm[LM_P.irisA], lm[LM_P.irisB]);
  const ipd = Math.hypot(lm[LM_P.irisA].x - lm[LM_P.irisB].x, lm[LM_P.irisA].y - lm[LM_P.irisB].y);
  const r = Math.max(1, Math.round(ipd / 60));
  const out: Detected = { hairlineFound: false, beardFound: false, edgesFound: false };

  const k = Math.max(3, Math.round(ipd * 0.12)); // ≈ 7 mm: wide enough to catch soft, blurry hairlines
  // Hairline (as seen): first strong colour edge going up the midline from landmark 10.
  const top = f.toLocal(lm[LM_P.top]);
  const hl = firstEdge(px, f, lm[LM_P.top], { x: 0, y: -1 }, ipd * 3, k, 10, r);
  if (hl && f.toLocal(hl).y < top.y) { out.hairline = hl; out.hairlineFound = true; }

  // Chin (as seen): if the chin is covered by darker, beard-like colour, the first edge below it.
  const cheekRef = patch(px, lm[205] ?? lm[LM_P.menton], r * 3);
  const m = f.toLocal(lm[LM_P.menton]);
  const at = patch(px, lm[LM_P.menton], r * 2);
  if (cheekRef && at && dE(at, cheekRef) > 16 && at[0] < cheekRef[0] - 6) {
    const end = firstEdge(px, f, lm[LM_P.menton], { x: 0, y: 1 }, ipd * 1.2, k, 10, r);
    if (end && f.toLocal(end).y - m.y > r * 3) { out.chin = end; out.beardFound = true; }
  }

  // Visible face edges at eye level: from the outer eye corner outwards while it stays skin.
  const eyeY = (f.toLocal(lm[LM_P.exoA]).y + f.toLocal(lm[LM_P.exoB]).y) / 2;
  const edges: Pt[] = [];
  for (const [exo, contour] of [[LM_P.exoA, LM_P.contourA], [LM_P.exoB, LM_P.contourB]] as const) {
    const e = f.toLocal(lm[exo]), c = f.toLocal(lm[contour]);
    // The mesh contour (127/356) traces the face outline at the temples. Search for the skin edge
    // only around it (from 70% of the way out to 30% beyond), so eye shadows and crow's-feet
    // can't end the search early; hair over the temples still moves the edge inwards.
    const dir = { x: Math.sign(c.x - e.x) || 1, y: 0 };
    const span = Math.abs(c.x - e.x);
    const startLocal = { x: e.x + dir.x * span * 0.7, y: eyeY + ipd * 0.1 };
    const hit = firstEdge(px, f, f.toImage(startLocal), dir, span * 0.6, Math.max(3, Math.round(k / 2)), 12, r);
    edges.push(hit ? f.toImage({ x: f.toLocal(hit).x, y: eyeY }) : f.toImage({ x: c.x, y: eyeY }));
  }
  [out.edgeL, out.edgeR] = f.toLocal(edges[0]).x < f.toLocal(edges[1]).x ? edges : [edges[1], edges[0]];
  out.edgesFound = true;
  return out;
}

/** Initial line positions: detected edges where found, landmark estimates elsewhere. */
export function initialLines(lm: Pt[], d: Detected): Record<LineKey, Pt> {
  const f = makeFrame(lm[LM_P.irisA], lm[LM_P.irisB]);
  const L = (i: number) => f.toLocal(lm[i]);
  const g = L(LM_P.glabella), sn = L(LM_P.subnasale), me = L(LM_P.menton);
  const midX = g.x;
  const im = (p: Pt) => f.toImage(p);
  // Estimated hairline if not found: landmark 10 sits below the hairline; go up by 45% of the 10→glabella span.
  const top = L(LM_P.top);
  const hairEst = { x: midX, y: top.y - (g.y - top.y) * 0.45 };
  const eyes = [L(LM_P.exoA), L(LM_P.endoA), L(LM_P.endoB), L(LM_P.exoB)].sort((a, b) => a.x - b.x);
  const eyeY = (eyes[0].y + eyes[3].y) / 2;
  const sto = { x: midX, y: (L(LM_P.stomionU).y + L(LM_P.stomionL).y) / 2 };
  return {
    hairline: d.hairline ? im({ x: midX, y: f.toLocal(d.hairline).y }) : im(hairEst),
    glabella: im({ x: midX, y: g.y }),
    subnasale: im({ x: midX, y: sn.y }),
    stomion: im(sto),
    chin: d.chin ? im({ x: midX, y: f.toLocal(d.chin).y }) : im({ x: midX, y: me.y }),
    edgeL: d.edgeL ?? im({ x: L(LM_P.contourA).x, y: eyeY }), edgeR: d.edgeR ?? im({ x: L(LM_P.contourB).x, y: eyeY }),
    exoL: im(eyes[0]), endoL: im(eyes[1]), endoR: im(eyes[2]), exoR: im(eyes[3]),
  };
}

export interface ProportionResult {
  frame: Frame;
  mmPerPx: number;
  thirds: { key: 'upper' | 'middle' | 'lower'; label: string; mm: number; share: number; dev: number; level: Level }[];
  lowerSplit: { upperLipShare: number; level: Level };
  fifths: { key: string; label: string; mm: number; ratioToEye: number }[];
  eyeWidthMm: number;
  spacing: { ratio: number; label: 'Close-set' | 'Balanced' | 'Wide-set'; level: Level };
  noseToGap: number;
  lengthToWidth: number;
  visibleWidthMm: number;
  faceLengthMm: number;
  shape: 'Long' | 'Balanced' | 'Short / wide';
  pose: Pose | null;
  warnings: string[];
}

const level = (absDev: number, mild: number, strong: number): Level => (absDev < mild ? 'Balanced' : absDev < strong ? 'Slightly' : 'Stands out');

export function analyseProportions(lm: Pt[], lines: Record<LineKey, Pt>, pose: Pose | null, extra: { hairlineEstimated: boolean; mouthOpen?: boolean }): ProportionResult {
  const f = makeFrame(lm[LM_P.irisA], lm[LM_P.irisB]);
  const irisR = (c: number) => (Math.hypot(lm[c + 1].x - lm[c].x, lm[c + 1].y - lm[c].y) + Math.hypot(lm[c + 3].x - lm[c].x, lm[c + 3].y - lm[c].y)) / 2;
  const mmPerPx = IRIS_DIAMETER_MM / (irisR(LM_P.irisA) + irisR(LM_P.irisB));
  const y = (k: LineKey) => f.toLocal(lines[k]).y, x = (k: LineKey) => f.toLocal(lines[k]).x;
  const up = (y('glabella') - y('hairline')) * mmPerPx, mid = (y('subnasale') - y('glabella')) * mmPerPx, low = (y('chin') - y('subnasale')) * mmPerPx;
  const total = up + mid + low;
  const mk = (key: 'upper' | 'middle' | 'lower', label: string, mm: number) => {
    const share = mm / total, dev = (share - 1 / 3) / (1 / 3);
    return { key, label, mm, share, dev, level: level(Math.abs(dev), 0.1, 0.18) };
  };
  const thirds = [mk('upper', 'Upper (hairline → brows)', up), mk('middle', 'Middle (brows → nose base)', mid), mk('lower', 'Lower (nose base → chin)', low)];
  const lipShare = ((y('stomion') - y('subnasale')) * mmPerPx) / low;
  const xs = (['edgeL', 'exoL', 'endoL', 'endoR', 'exoR', 'edgeR'] as LineKey[]).map((k) => x(k) * mmPerPx);
  const seg = xs.slice(1).map((v, i) => v - xs[i]);
  const eyeW = (seg[1] + seg[3]) / 2;
  const fifths = [
    { key: 'outerL', label: 'Visible side (left)', mm: seg[0] },
    { key: 'eyeL', label: 'Eye (left)', mm: seg[1] },
    { key: 'gap', label: 'Between the eyes', mm: seg[2] },
    { key: 'eyeR', label: 'Eye (right)', mm: seg[3] },
    { key: 'outerR', label: 'Visible side (right)', mm: seg[4] },
  ].map((s) => ({ ...s, ratioToEye: s.mm / eyeW }));
  const spacingRatio = seg[2] / eyeW;
  const spacing = {
    ratio: spacingRatio,
    label: (spacingRatio > 1.22 ? 'Wide-set' : spacingRatio < 0.88 ? 'Close-set' : 'Balanced') as 'Close-set' | 'Balanced' | 'Wide-set',
    level: level(Math.abs(spacingRatio - 1.05), 0.17, 0.3),
  };
  const ala = Math.abs(f.toLocal(lm[LM_P.alaA]).x - f.toLocal(lm[LM_P.alaB]).x) * mmPerPx;
  const visibleWidth = xs[5] - xs[0];
  const lengthToWidth = total / visibleWidth;
  const warnings: string[] = [];
  if (pose) {
    if (Math.abs(pose.pitch) > 8) warnings.push(`Head is tilted ${pose.pitch > 0 ? 'down' : 'up'} about ${Math.abs(pose.pitch).toFixed(0)}°. This changes all three thirds; keep the camera at eye level.`);
    if (Math.abs(pose.yaw) > 8) warnings.push(`Head is turned about ${Math.abs(pose.yaw).toFixed(0)}° to one side. Fifths are unreliable; face the camera straight on.`);
  }
  if (extra.mouthOpen) warnings.push('Mouth looks open or smiling. That lengthens the lower third; use a neutral expression with lips together.');
  if (extra.hairlineEstimated) warnings.push('The hairline was estimated. Drag the top line to where your forehead skin ends (or where your fringe starts).');
  return {
    frame: f, mmPerPx, thirds, lowerSplit: { upperLipShare: lipShare, level: level(Math.abs(lipShare - 1 / 3) / (1 / 3), 0.2, 0.35) },
    fifths, eyeWidthMm: eyeW, spacing, noseToGap: ala / seg[2], lengthToWidth, visibleWidthMm: visibleWidth, faceLengthMm: total,
    shape: lengthToWidth > 1.55 ? 'Long' : lengthToWidth < 1.3 ? 'Short / wide' : 'Balanced', pose, warnings,
  };
}

export function mouthOpen(lm: Pt[]): boolean {
  const gap = Math.hypot(lm[LM_P.stomionU].x - lm[LM_P.stomionL].x, lm[LM_P.stomionU].y - lm[LM_P.stomionL].y);
  const faceLen = Math.hypot(lm[LM_P.top].x - lm[LM_P.menton].x, lm[LM_P.top].y - lm[LM_P.menton].y);
  return gap / faceLen > 0.025;
}
