/**
 * Eyebrow mapping from face landmarks (MediaPipe Face Landmarker, 478 points, pixel coords).
 *
 * Guidelines (see project doc "research-selfie-season-and-brows"):
 *  - Start: vertical line through the lateral nasal ala / inner eye corner (Westmore).
 *  - Peak: above the lateral limbus (outer iris edge), towards the lateral canthus;
 *          the most preferred zone is between limbus and canthus.
 *  - Tail: on the oblique line from the lateral ala through the outer eye corner;
 *          tail not lower than the head.
 *  - Style: "soft arch" (default), "defined arch", "straight & full" (typical male brow:
 *          flatter, fuller, little arch). Face shape nudges arch height (round → higher,
 *          long → flatter), which is beauty-industry guidance, not clinical evidence.
 *  - Scale: visible iris diameter ≈ 11.7 mm, used to convert pixels to approximate mm.
 * The head roll is removed first so "vertical" means vertical to the face, not the photo.
 */
export interface Pt { x: number; y: number }
export type BrowStyle = 'soft' | 'defined' | 'straight';
export type FaceShape = 'Oval' | 'Round' | 'Long' | 'Square' | 'Heart';

export const IRIS_DIAMETER_MM = 11.7;
export const LM = {
  browA_upper: [70, 63, 105, 66, 107], browA_lower: [46, 53, 52, 65, 55],
  browB_upper: [300, 293, 334, 296, 336], browB_lower: [276, 283, 282, 295, 285],
  eyeA_outer: 33, eyeA_inner: 133, eyeB_inner: 362, eyeB_outer: 263,
  eyeA_upperLid: 159, eyeB_upperLid: 386,
  irisA: [468, 469, 470, 471, 472], irisB: [473, 474, 475, 476, 477],
  alaA: 129, alaB: 358,
  forehead: [54, 284], cheek: [234, 454], jaw: [172, 397], top: 10, chin: 152,
};

export interface Frame { origin: Pt; angle: number; toLocal(p: Pt): Pt; toImage(p: Pt): Pt }
export function makeFrame(a: Pt, b: Pt): Frame {
  const origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const c = Math.cos(-angle), s = Math.sin(-angle);
  return {
    origin, angle,
    toLocal: (p) => ({ x: (p.x - origin.x) * c - (p.y - origin.y) * s, y: (p.x - origin.x) * s + (p.y - origin.y) * c }),
    toImage: (p) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle) + origin.x, y: p.x * Math.sin(angle) + p.y * Math.cos(angle) + origin.y }),
  };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (ps: Pt[]) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });

export function faceShapeOf(lm: Pt[]): { shape: FaceShape; ratios: { lengthToWidth: number; jawToCheek: number; foreheadToCheek: number } } {
  const cheek = dist(lm[LM.cheek[0]], lm[LM.cheek[1]]);
  const jaw = dist(lm[LM.jaw[0]], lm[LM.jaw[1]]);
  const forehead = dist(lm[LM.forehead[0]], lm[LM.forehead[1]]);
  // Landmark 10 sits below the hairline; add ~15% of the measured length as a rough hairline allowance.
  const length = dist(lm[LM.top], lm[LM.chin]) * 1.15;
  const lengthToWidth = length / cheek, jawToCheek = jaw / cheek, foreheadToCheek = forehead / cheek;
  let shape: FaceShape = 'Oval';
  if (lengthToWidth > 1.55) shape = 'Long';
  else if (lengthToWidth < 1.3 && jawToCheek > 0.8) shape = 'Square';
  else if (lengthToWidth < 1.3) shape = 'Round';
  else if (foreheadToCheek > 0.92 && jawToCheek < 0.72) shape = 'Heart';
  else if (jawToCheek > 0.84) shape = 'Square';
  return { shape, ratios: { lengthToWidth, jawToCheek, foreheadToCheek } };
}

export interface BrowSide {
  side: 'A' | 'B';            // A = image-left brow, B = image-right brow
  outward: 1 | -1;            // +1 if "outward" (towards the temple) is +x in local coords
  current: { upper: Pt[]; lower: Pt[]; start: Pt; tail: Pt; peak: Pt; thickness: number };
  ideal: { upper: Pt[]; lower: Pt[]; start: Pt; peak: Pt; tail: Pt };
  guides: { ala: Pt; startTop: Pt; limbus: Pt; peakLine: [Pt, Pt]; tailLine: [Pt, Pt] };
  iris: { c: Pt; r: number };
  advice: string[];
  metrics: { startOffsetMm: number; tailOffsetMm: number; peakOffsetMm: number; tailDropMm: number; thicknessMm: number; lengthMm: number };
}
export interface BrowAnalysis {
  frame: Frame; mmPerPx: number; faceShape: FaceShape; style: BrowStyle; sides: BrowSide[];
  symmetry: string[]; summary: string[];
}

function closer<T>(a: T, b: T, ref: Pt, get: (t: T) => Pt): [T, T] { return dist(get(a), ref) <= dist(get(b), ref) ? [a, b] : [b, a]; }

/** Catmull-Rom sampled polyline through control points (local coords). */
function smooth(points: Pt[], n = 24): Pt[] {
  const out: Pt[] = [];
  const P = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    for (let t = 0; t < 1; t += 1 / n) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** y of a polyline at x (linear interpolation; polyline sorted by x). */
export function yAt(poly: Pt[], x: number): number | null {
  const s = [...poly].sort((a, b) => a.x - b.x);
  if (x < s[0].x || x > s[s.length - 1].x) return null;
  for (let i = 1; i < s.length; i++) if (x <= s[i].x) {
    const t = (x - s[i - 1].x) / (s[i].x - s[i - 1].x || 1);
    return s[i - 1].y + t * (s[i].y - s[i - 1].y);
  }
  return s[s.length - 1].y;
}

const ARCH: Record<BrowStyle, number> = { soft: 0.55, defined: 0.85, straight: 0.15 };
const SHAPE_ARCH: Record<FaceShape, number> = { Oval: 1, Round: 1.25, Long: 0.65, Square: 1.05, Heart: 0.95 };
const PEAK_TOWARD_CANTHUS: Record<BrowStyle, number> = { soft: 0.35, defined: 0.45, straight: 0.5 };
const TAIL_THICKNESS: Record<BrowStyle, number> = { soft: 0.4, defined: 0.33, straight: 0.6 };

export function analyseBrows(lm: Pt[], style: BrowStyle = 'soft'): BrowAnalysis {
  if (lm.length < 478) throw new Error('Iris landmarks missing (need 478 points)');
  const irisA = { c: lm[LM.irisA[0]], r: LM.irisA.slice(1).reduce((s, i) => s + dist(lm[i], lm[LM.irisA[0]]), 0) / 4 };
  const irisB = { c: lm[LM.irisB[0]], r: LM.irisB.slice(1).reduce((s, i) => s + dist(lm[i], lm[LM.irisB[0]]), 0) / 4 };
  const frame = makeFrame(irisA.c.x < irisB.c.x ? irisA.c : irisB.c, irisA.c.x < irisB.c.x ? irisB.c : irisA.c);
  const mmPerPx = IRIS_DIAMETER_MM / (irisA.r + irisB.r);
  const L = (p: Pt) => frame.toLocal(p);
  const { shape } = faceShapeOf(lm);

  const browSets = [
    { upper: LM.browA_upper.map((i) => lm[i]), lower: LM.browA_lower.map((i) => lm[i]) },
    { upper: LM.browB_upper.map((i) => lm[i]), lower: LM.browB_lower.map((i) => lm[i]) },
  ];
  const sides: BrowSide[] = [];
  for (const iris of [irisA, irisB]) {
    const ic = L(iris.c);
    const outward: 1 | -1 = ic.x < 0 ? -1 : 1;
    const [brow] = closer(browSets[0], browSets[1], iris.c, (b) => mean(b.upper));
    const [outerC] = closer(lm[LM.eyeA_outer], lm[LM.eyeB_outer], iris.c, (p) => p);
    const [innerC] = closer(lm[LM.eyeA_inner], lm[LM.eyeB_inner], iris.c, (p) => p);
    const [ala] = closer(lm[LM.alaA], lm[LM.alaB], iris.c, (p) => p);
    const upper = brow.upper.map(L).sort((a, b) => outward * (a.x - b.x));
    const lower = brow.lower.map(L).sort((a, b) => outward * (a.x - b.x));
    const O = L(outerC), I = L(innerC), A = L(ala);
    // current
    const start = { x: (upper[0].x + lower[0].x) / 2, y: (upper[0].y + lower[0].y) / 2 };
    const tail = { x: (upper[upper.length - 1].x + lower[lower.length - 1].x) / 2, y: (upper[upper.length - 1].y + lower[lower.length - 1].y) / 2 };
    const peak = upper.reduce((m, p) => (p.y < m.y ? p : m), upper[0]);
    const thickness = lower.reduce((s, p) => s + (yAt(lower, p.x)! - (yAt(upper, p.x) ?? p.y)), 0) / lower.length;
    const headThick = Math.max(4, Math.abs(lower[0].y - upper[0].y));

    // ideal key x positions
    const startX = (A.x + I.x) / 2;
    const limbusX = ic.x + outward * iris.r;
    const peakX = limbusX + PEAK_TOWARD_CANTHUS[style] * (O.x - limbusX);
    // tail: line from ala through outer canthus, evaluated at brow height
    const headLowerY = yAt(lower, startX) ?? lower[0].y;
    const dirX = O.x - A.x, dirY = O.y - A.y;
    const tLine = (headLowerY - headThick * 0.6 - A.y) / dirY; // reach roughly mid-brow height
    let tailX = A.x + dirX * tLine;
    // optional: stop 0–2 mm short for a lifted look
    tailX -= outward * (style === 'defined' ? 2 : 0) / mmPerPx;

    const arch = ARCH[style] * SHAPE_ARCH[shape] * headThick;
    const tailLift = style === 'straight' ? 0.05 * headThick : 0.15 * headThick; // tail not below head
    const lowerIdeal = smooth([
      { x: startX, y: headLowerY },
      { x: startX + (peakX - startX) * 0.5, y: headLowerY - arch * 0.55 },
      { x: peakX, y: headLowerY - arch },
      { x: tailX, y: headLowerY - tailLift - arch * 0.25 },
    ]);
    const thickAt = (x: number) => {
      const u = (x - startX) / (tailX - startX || 1); // 0 at start, 1 at tail
      const tailT = TAIL_THICKNESS[style];
      const pu = (peakX - startX) / (tailX - startX || 1);
      return headThick * (u <= pu ? 1 - 0.12 * (u / pu) : 0.88 - (0.88 - tailT) * ((u - pu) / (1 - pu)));
    };
    const upperIdeal = lowerIdeal.map((p) => ({ x: p.x, y: p.y - thickAt(p.x) }));

    // advice (mm, positive = outward/longer/higher)
    const mm = (px: number) => px * mmPerPx;
    const startOffsetMm = mm(outward * (start.x - startX)); // + : starts too far out (gap), − : too close to nose
    const tailOffsetMm = mm(outward * (tail.x - tailX));     // + : too long, − : too short
    const peakOffsetMm = mm(outward * (peak.x - peakX));     // − : peak too far in (surprised look)
    const tailDropMm = mm(tail.y - (headLowerY - headThick / 2)); // + : tail lower than head centre
    const lengthMm = mm(Math.abs(tail.x - start.x));
    const advice: string[] = [];
    if (startOffsetMm < -1.5) advice.push(`Head starts ~${(-startOffsetMm).toFixed(0)} mm closer to the nose than the guide: tweeze the hairs between the brows up to the start line.`);
    else if (startOffsetMm > 1.5) advice.push(`Head starts ~${startOffsetMm.toFixed(0)} mm out from the guide: fill the gap towards the nose with light hair-like strokes.`);
    else advice.push('Head (start) is in line with the guide: leave it.');
    if (tailOffsetMm > 2) advice.push(`Tail runs ~${tailOffsetMm.toFixed(0)} mm past the nose–eye-corner line: trim or tweeze the end.`);
    else if (tailOffsetMm < -2) advice.push(`Tail stops ~${(-tailOffsetMm).toFixed(0)} mm short: extend it with pencil or powder, keeping it thin.`);
    else advice.push('Tail length is in line with the guide.');
    if (style !== 'straight') {
      if (peakOffsetMm < -3) advice.push(`Highest point sits ~${(-peakOffsetMm).toFixed(0)} mm too far towards the nose (can look surprised): keep hairs above the guide peak, tidy those above your current peak.`);
      else if (peakOffsetMm > 4) advice.push(`Highest point sits ~${peakOffsetMm.toFixed(0)} mm far out: build height above the outer iris edge.`);
    }
    if (tailDropMm > 2.5) advice.push(`Tail droops ~${tailDropMm.toFixed(0)} mm below the head: remove the lowest hairs under the tail to lift it.`);
    sides.push({
      side: ic.x < 0 ? 'A' : 'B',
      outward, iris: { c: ic, r: iris.r },
      current: { upper, lower, start, tail, peak, thickness },
      ideal: { upper: upperIdeal, lower: lowerIdeal, start: { x: startX, y: headLowerY }, peak: { x: peakX, y: headLowerY - arch }, tail: { x: tailX, y: headLowerY - tailLift } },
      guides: {
        ala: A, startTop: { x: startX, y: headLowerY - headThick * 3 }, limbus: { x: limbusX, y: ic.y },
        peakLine: [A, { x: A.x + (limbusX - A.x) * 2.2, y: A.y + (ic.y - A.y) * 2.2 }],
        tailLine: [A, { x: A.x + dirX * Math.max(1.6, tLine * 1.1), y: A.y + dirY * Math.max(1.6, tLine * 1.1) }],
      },
      advice, metrics: { startOffsetMm, tailOffsetMm, peakOffsetMm, tailDropMm, thicknessMm: mm(thickness), lengthMm },
    });
  }
  sides.sort((a, b) => (a.side < b.side ? -1 : 1));

  const [a, b] = sides;
  const symmetry: string[] = [];
  const peakHA = mm2(a.iris.c.y - a.current.peak.y), peakHB = mm2(b.iris.c.y - b.current.peak.y);
  function mm2(px: number) { return px * mmPerPx; }
  if (Math.abs(peakHA - peakHB) > 2) symmetry.push(`Arch heights differ by ~${Math.abs(peakHA - peakHB).toFixed(0)} mm: shape the higher brow to the lower one rather than plucking both up.`);
  if (Math.abs(a.metrics.lengthMm - b.metrics.lengthMm) > 3) symmetry.push(`Lengths differ by ~${Math.abs(a.metrics.lengthMm - b.metrics.lengthMm).toFixed(0)} mm.`);
  if (!symmetry.length) symmetry.push('Both brows are close in height and length (within ~2–3 mm).');

  const styleText = style === 'straight' ? 'a straighter, fuller brow with minimal arch' : style === 'defined' ? 'a defined arch' : 'a soft natural arch';
  const shapeText: Record<FaceShape, string> = {
    Oval: 'Oval faces suit most shapes; keep the arch soft.',
    Round: 'For a rounder face, a slightly higher arch and defined tail add length.',
    Long: 'For a longer face, a flatter brow adds width; the arch was lowered.',
    Square: 'For a squarer jaw, a rounded rather than angular arch softens the angles.',
    Heart: 'For a heart shape, a gently rounded brow balances a wider forehead.',
  };
  return { frame, mmPerPx, faceShape: shape, style, sides, symmetry, summary: [`Mapped for ${styleText}.`, shapeText[shape]] };
}

/** Point-in-polygon (ray casting), local coords. */
export function inside(poly: Pt[], p: Pt): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
export const outline = (upper: Pt[], lower: Pt[]) => [...upper, ...[...lower].reverse()];
