/**
 * Turns perceived proportions + the person's own options into practical, realistic tips.
 * Every tip says which part of the face it balances and whether it is backed by research or
 * is stylist/optician convention. Tips only suggest changes within what the person has.
 */
import type { ProportionResult } from './proportions';

export type Presentation = 'man' | 'woman' | 'unspecified';
export type HairLength = 'shaved' | 'short' | 'medium' | 'long';
export type Hairline = 'full' | 'receding' | 'thinning';
export type FacialHair = 'none' | 'stubble' | 'short' | 'full' | 'cannot';
export type Glasses = 'no' | 'yes' | 'open';

export interface FaceProfile {
  presentation: Presentation;
  hairLength: HairLength;
  hairline: Hairline;
  facialHair: FacialHair;
  glasses: Glasses;
}
export const DEFAULT_PROFILE: FaceProfile = { presentation: 'unspecified', hairLength: 'medium', hairline: 'full', facialHair: 'none', glasses: 'open' };

export type Area = 'Hair' | 'Facial hair' | 'Brows' | 'Glasses';
export interface Tip {
  area: Area;
  title: string;
  detail: string;
  balances: string;
  evidence: 'Research-backed' | 'Stylist convention' | 'Optician convention';
  priority: number; // higher first
  visual?: { kind: 'fringe' | 'beard-chin' | 'beard-trim' | 'side-volume' | 'side-tight' | 'top-volume'; mm: number };
}

const canGrowBeard = (p: FaceProfile) => p.presentation !== 'woman' && p.facialHair !== 'cannot';
const hasBeard = (p: FaceProfile) => p.facialHair === 'short' || p.facialHair === 'full';
const mmTxt = (mm: number) => `${Math.max(1, Math.round(mm / 5) * 5)} mm`;

export function styleTips(r: ProportionResult, p: FaceProfile): Tip[] {
  const tips: Tip[] = [];
  const [up, mid, low] = r.thirds;
  const avg = (a: number, b: number) => (a + b) / 2;

  // ---------- Upper third ----------
  if (up.dev > 0.1) {
    const excess = up.mm - avg(mid.mm, low.mm);
    if (p.hairLength === 'shaved' || p.hairLength === 'short') {
      tips.push({ area: 'Hair', title: p.hairline === 'full' ? 'Wear the front forward' : 'Short textured crop with a forward fringe',
        detail: p.hairline === 'full'
          ? `Style the top forward or as a short textured fringe so it covers about ${mmTxt(excess)} of the forehead. Avoid slicking it back or adding height at the front, which exposes and lengthens the forehead.`
          : `With a receding or thinning hairline, a short, even crop with the front pushed forward hides the hairline shape and shortens the forehead by up to ${mmTxt(excess)}. Avoid longer lengths combed over.`,
        balances: 'Long upper third', evidence: 'Stylist convention', priority: 9, visual: { kind: 'fringe', mm: excess } });
    } else {
      tips.push({ area: 'Hair', title: 'Add a fringe or curtain fringe',
        detail: `A fringe that sits about ${mmTxt(excess)} below your hairline balances the forehead. A side-swept or curtain fringe is a softer version that still breaks the forehead line. Avoid hair pulled tightly back or extra height on top.`,
        balances: 'Long upper third', evidence: 'Stylist convention', priority: 9, visual: { kind: 'fringe', mm: excess } });
    }
    if (p.glasses !== 'no') tips.push({ area: 'Glasses', title: 'Frames with a strong top line',
      detail: 'A frame whose top edge follows the brow line and has some weight there draws the eye to the middle of the face and makes the forehead read shorter.',
      balances: 'Long upper third', evidence: 'Optician convention', priority: 4 });
    tips.push({ area: 'Brows', title: 'Keep brows full rather than thin',
      detail: 'Fuller, defined brows give the upper face a clear frame so the forehead area looks smaller. Avoid over-plucking the top edge.',
      balances: 'Long upper third', evidence: 'Stylist convention', priority: 3 });
  } else if (up.dev < -0.1) {
    tips.push({ area: 'Hair', title: 'Show your forehead and add lift',
      detail: p.hairLength === 'shaved' ? 'Keep the front short and clean so the full forehead shows.'
        : 'Wear the front up or back (light quiff, brushed back or side part) instead of a heavy fringe. Lift at the front makes the upper face read longer.',
      balances: 'Short upper third', evidence: 'Stylist convention', priority: 8, visual: { kind: 'top-volume', mm: avg(mid.mm, low.mm) - up.mm } });
  }

  // ---------- Middle third ----------
  if (mid.dev > 0.1) {
    if (p.glasses !== 'no') tips.push({ area: 'Glasses', title: 'A frame with a lower or darker bridge',
      detail: 'A bridge that sits lower on the nose, or a thicker/darker bridge, adds a horizontal line across the middle third and makes the nose read shorter. Clear, high bridges do the opposite.',
      balances: 'Long middle third', evidence: 'Optician convention', priority: 6 });
    if (canGrowBeard(p)) tips.push({ area: 'Facial hair', title: 'Keep a moustache',
      detail: 'A neat moustache adds a horizontal line directly under the nose, which visually ends the middle third and shortens it.',
      balances: 'Long middle third', evidence: 'Stylist convention', priority: 5 });
  } else if (mid.dev < -0.12) {
    if (p.glasses !== 'no') tips.push({ area: 'Glasses', title: 'A high or clear (keyhole) bridge',
      detail: 'A higher-set or transparent bridge leaves the nose uninterrupted, so the middle third reads longer.',
      balances: 'Short middle third', evidence: 'Optician convention', priority: 4 });
  }

  // ---------- Lower third ----------
  if (low.dev < -0.1) {
    const short = avg(up.mm, mid.mm) - low.mm;
    if (canGrowBeard(p)) {
      tips.push({ area: 'Facial hair', title: hasBeard(p) ? 'Keep the beard longer at the chin than at the sides' : 'Grow a short beard with length at the chin',
        detail: `Let the chin area extend about ${mmTxt(short)} below the jawline while the sides stay shorter. Beards measurably enlarge the perceived lower face, which balances a short lower third.`,
        balances: 'Short lower third', evidence: 'Research-backed', priority: 9, visual: { kind: 'beard-chin', mm: short } });
    }
    if (p.hairLength === 'long' || p.hairLength === 'medium') tips.push({ area: 'Hair', title: 'Avoid hair ending exactly at the chin',
      detail: 'A cut that ends at the chin draws a line there and makes the lower face look shorter. Ending at the collarbone or above the jaw works better.',
      balances: 'Short lower third', evidence: 'Stylist convention', priority: 5 });
  } else if (low.dev > 0.1) {
    const excess = low.mm - avg(up.mm, mid.mm);
    if (hasBeard(p) || p.facialHair === 'stubble') {
      tips.push({ area: 'Facial hair', title: 'Keep the chin short and the sides fuller',
        detail: `Trim the chin and neck so the beard ends close to the jawline (about ${mmTxt(Math.min(excess, 25))} shorter than now if it extends below). Keep slightly more length on the cheeks so the face reads wider rather than longer.`,
        balances: 'Long lower third', evidence: 'Research-backed', priority: 9, visual: { kind: 'beard-trim', mm: excess } });
    }
    if (p.hairLength !== 'shaved') tips.push({ area: 'Hair', title: 'Width at the sides, little height on top',
      detail: 'Keep the top relatively flat and let the sides carry some width (or, with longer hair, volume around the cheekbones). Tall styles add length.',
      balances: 'Long lower third', evidence: 'Stylist convention', priority: 6, visual: { kind: 'side-volume', mm: 10 } });
  }

  // ---------- Overall shape ----------
  if (r.shape === 'Long') {
    if (p.hairLength !== 'shaved') tips.push({ area: 'Hair', title: 'Avoid height on top, add width at the sides',
      detail: 'Long faces look more balanced with fullness at the temples and sides and a flatter top. A fringe helps further. Avoid tall quiffs and tight sides.',
      balances: 'Long face overall', evidence: 'Stylist convention', priority: 7, visual: { kind: 'side-volume', mm: 12 } });
    if (canGrowBeard(p) && hasBeard(p)) tips.push({ area: 'Facial hair', title: 'Fuller cheeks, shorter chin',
      detail: 'Shape the beard to be fuller on the cheeks and shorter at the chin so it adds width instead of length.',
      balances: 'Long face overall', evidence: 'Stylist convention', priority: 6 });
  } else if (r.shape === 'Short / wide') {
    if (p.hairLength !== 'shaved') tips.push({ area: 'Hair', title: 'Height on top, tighter sides',
      detail: 'Some lift on top and shorter or flatter sides make a wide face look longer. Avoid volume over the ears.',
      balances: 'Short or wide face', evidence: 'Stylist convention', priority: 7, visual: { kind: 'side-tight', mm: 8 } });
    if (canGrowBeard(p)) tips.push({ area: 'Facial hair', title: 'Tapered beard: short sides, longer chin',
      detail: 'Keep the cheeks short and let the chin carry the length, which adds vertical length and narrows the lower face.',
      balances: 'Short or wide face', evidence: 'Stylist convention', priority: 6, visual: { kind: 'beard-chin', mm: 15 } });
  }

  // ---------- Fifths: eye spacing ----------
  if (r.spacing.label === 'Wide-set') {
    tips.push({ area: 'Brows', title: 'Start the brows a little closer to the centre',
      detail: 'Keep the brow heads full and, if needed, fill them 1–2 mm towards the nose (staying outside the nostril line). This visually narrows the gap between the eyes. Never tweeze the inner ends.',
      balances: 'Wide-set eyes', evidence: 'Stylist convention', priority: 6 });
    if (p.glasses !== 'no') tips.push({ area: 'Glasses', title: 'A darker or thicker bridge',
      detail: 'A solid, darker bridge fills the space between the eyes and draws them together.',
      balances: 'Wide-set eyes', evidence: 'Optician convention', priority: 5 });
  } else if (r.spacing.label === 'Close-set') {
    tips.push({ area: 'Brows', title: 'Keep the brow heads in line with the inner eye corner',
      detail: 'Tidy hairs between the brows so each brow starts right above the inner eye corner or 1 mm outside it. This opens up the centre of the face.',
      balances: 'Close-set eyes', evidence: 'Stylist convention', priority: 6 });
    if (p.glasses !== 'no') tips.push({ area: 'Glasses', title: 'A thin, clear or keyhole bridge',
      detail: 'A light bridge keeps the space between the eyes open, so the eyes read further apart.',
      balances: 'Close-set eyes', evidence: 'Optician convention', priority: 5 });
  }

  // ---------- Glasses width (always useful when relevant) ----------
  if (p.glasses !== 'no') {
    const w = Math.round(r.visibleWidthMm / 2) * 2;
    tips.push({ area: 'Glasses', title: `Total frame width about ${w - 4}–${w + 4} mm`,
      detail: `Your visible face width at eye level is about ${Math.round(r.visibleWidthMm)} mm. Frames should match the widest part of the face or sit slightly wider, and the top edge should follow your brows. Check the total width on the product page (lens + bridge + lens + rims), or ask the optician.`,
      balances: 'Face width (fifths)', evidence: 'Optician convention', priority: 2 });
  }

  if (!tips.some((t) => t.priority >= 5)) tips.push({ area: 'Hair', title: 'Your proportions are already balanced',
    detail: 'No third or fifth clearly stands out. Keep styles that do not add a lot of height, width or length in one direction.',
    balances: 'Overall', evidence: 'Stylist convention', priority: 1 });
  return tips.sort((a, b) => b.priority - a.priority);
}
