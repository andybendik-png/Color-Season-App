/**
 * One face photo shared by the Colour tab (season, drape test) and the Face tab (proportions,
 * brows). Lives in App so switching tabs keeps the photo, points and adjustments.
 */
import { useCallback, useMemo, useState } from 'react';
import { defaultPoints, detectLandmarks, pointsFromLandmarks, type PointKey, type SamplePoint } from '../engine/faceLandmarks';
import { analysePerson, combineWithDraping, type PersonalAnalysis } from '../engine/faceAnalysis';
import { sampleAnnulus, sampleCircle } from '../engine/sampling';
import { analyseProportions, detectEdges, initialLines, mouthOpen, type Detected, type LineKey, type PixelFn, type Pose, type ProportionResult } from '../engine/proportions';
import type { BrowStyle, Pt } from '../engine/brows';
import type { Vec3 } from '../engine/colourConversion';
import type { FaceProfile } from '../engine/faceStyling';
import type { BrowOverrides, DrapeAnswers, SavedAnalysis } from '../storage/analyses';
import { uid } from '../storage/database';

const MAX_SIDE = 1200;
export const NO_DRAPE: DrapeAnswers = { clarity: null, temperature: null, value: null };

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

export function pixelFn(canvas: HTMLCanvasElement): PixelFn {
  const d = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)!.getImageData(0, 0, canvas.width, canvas.height).data;
  const w = canvas.width, h = canvas.height;
  return (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? null : [d[(y * w + x) * 4], d[(y * w + x) * 4 + 1], d[(y * w + x) * 4 + 2]]);
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

export function useFaceSession(profile: FaceProfile, saved: SavedAnalysis[], persist: (a: SavedAnalysis) => Promise<void>) {
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [points, setPoints] = useState<Record<PointKey, SamplePoint> | null>(null);
  const [landmarks, setLandmarks] = useState<Pt[] | null>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [useWhite, setUseWhite] = useState(false);
  const [drape, setDrape] = useState<DrapeAnswers>(NO_DRAPE);
  const [browStyle, setBrowStyle] = useState<BrowStyle>('soft');
  const [browOverrides, setBrowOverrides] = useState<BrowOverrides>({});
  const [lines, setLines] = useState<Record<LineKey, Pt> | null>(null);
  const [detected, setDetected] = useState<Detected | null>(null);
  const [hairlineMoved, setHairlineMoved] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setPhoto(null); setPoints(null); setLandmarks(null); setPose(null); setLines(null); setDetected(null);
    setCurrentId(null); setDrape(NO_DRAPE); setBrowOverrides({}); setHairlineMoved(false); setStatus(null);
  }, []);

  const open = useCallback(async (src: string, preset?: SavedAnalysis) => {
    setBusy(true); setStatus('Loading photo…');
    try {
      const c = await loadImage(src);
      setPhoto(c); setBrowOverrides({}); setHairlineMoved(false);
      if (preset) {
        const k = c.width / preset.width;
        const sc = (p: Pt) => ({ x: p.x * k, y: p.y * k });
        setPoints(preset.points); setUseWhite(preset.useWhite); setDrape(preset.drape); setBrowStyle(preset.browStyle); setCurrentId(preset.id);
        const lm = preset.landmarks;
        const L = lm ? Array.from({ length: lm.length / 2 }, (_, i) => ({ x: lm[2 * i] * k, y: lm[2 * i + 1] * k })) : null;
        setLandmarks(L); setPose(preset.pose ?? null); setBrowOverrides(preset.browOverrides ?? {});
        if (preset.proportions) {
          setLines(Object.fromEntries(Object.entries(preset.proportions.lines).map(([key, p]) => [key, sc(p)])) as Record<LineKey, Pt>);
          setDetected({ hairlineFound: !preset.proportions.hairlineEstimated, beardFound: false, edgesFound: true });
          setHairlineMoved(true);
        } else if (L) {
          const d = detectEdges(L, pixelFn(c)); setDetected(d); setLines(initialLines(L, d));
        } else { setLines(null); setDetected(null); }
        setStatus(null);
        return;
      }
      setCurrentId(null); setDrape(NO_DRAPE); setLandmarks(null); setPose(null); setLines(null); setDetected(null);
      setPoints(defaultPoints(c.width, c.height));
      setStatus('Finding your face on the device…');
      try {
        const res = await detectLandmarks(c);
        if (res) {
          setLandmarks(res.points); setPose(res.pose); setPoints(pointsFromLandmarks(res.points));
          const d = detectEdges(res.points, pixelFn(c)); setDetected(d); setLines(initialLines(res.points, d));
          setStatus('Face found. Drag any point or line that missed its target.');
        } else setStatus('No face found. Drag the points onto your cheeks, forehead, chin, hair and irises.');
      } catch (e) {
        setStatus(`${e instanceof Error ? e.message : 'Face detection unavailable.'} Drag the points into place.`);
      }
    } catch {
      setStatus('That file could not be opened as an image.');
    } finally { setBusy(false); }
  }, []);

  const openFile = useCallback(async (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    try { await open(url); } finally { URL.revokeObjectURL(url); }
  }, [open]);

  const colour: PersonalAnalysis | null = useMemo(() => {
    if (!photo || !points) return null;
    try { return analysePerson(samplePoints(photo, points, useWhite)); } catch { return null; }
  }, [photo, points, useWhite]);
  const combined = useMemo(() => (colour && (drape.clarity !== null || drape.temperature !== null || drape.value !== null) ? combineWithDraping(colour, drape) : null), [colour, drape]);

  const hairlineEstimated = !!detected && !detected.hairlineFound && !hairlineMoved;
  const proportions: ProportionResult | null = useMemo(() => {
    if (!landmarks || !lines) return null;
    try { return analyseProportions(landmarks, lines, pose, { hairlineEstimated, mouthOpen: mouthOpen(landmarks) }); } catch { return null; }
  }, [landmarks, lines, pose, hairlineEstimated]);

  const moveLine = useCallback((k: LineKey, p: Pt) => {
    setLines((prev) => (prev ? { ...prev, [k]: p } : prev));
    if (k === 'hairline') setHairlineMoved(true);
  }, []);
  const resetLines = useCallback(() => {
    if (!landmarks || !photo) return;
    const d = detectEdges(landmarks, pixelFn(photo)); setDetected(d); setLines(initialLines(landmarks, d)); setHairlineMoved(false);
  }, [landmarks, photo]);

  const save = useCallback(async () => {
    if (!photo || !points || !colour) return null;
    setSaving(true);
    const k = Math.min(1, 900 / Math.max(photo.width, photo.height));
    const c = document.createElement('canvas'); c.width = Math.round(photo.width * k); c.height = Math.round(photo.height * k);
    c.getContext('2d')!.drawImage(photo, 0, 0, c.width, c.height);
    const sc = (p: Pt) => ({ x: p.x * k, y: p.y * k });
    const scalePts = Object.fromEntries(Object.entries(points).map(([key, p]) => [key, { ...p, x: p.x * k, y: p.y * k, r: p.r * k }])) as Record<PointKey, SamplePoint>;
    const now = Date.now();
    const scaleOv: BrowOverrides = Object.fromEntries(Object.entries(browOverrides).map(([side, o]) => [side, Object.fromEntries(Object.entries(o ?? {}).map(([kk, v]) => [kk, (v as number) * k]))])) as BrowOverrides;
    const rec: SavedAnalysis = {
      id: currentId ?? uid(), createdAt: saved.find((s) => s.id === currentId)?.createdAt ?? now, updatedAt: now,
      name: `Analysis ${new Date(now).toLocaleDateString()}`, photo: c.toDataURL('image/jpeg', 0.82), width: c.width, height: c.height,
      points: scalePts, useWhite, landmarks: landmarks ? landmarks.flatMap((p) => [p.x * k, p.y * k]) : null, browStyle, drape,
      summary: { topSeason: colour.ranking[0].name, topSeasonId: colour.ranking[0].id, confidence: colour.confidence, dominant: colour.dominant, secondary: colour.secondary, combinedTop: combined?.[0].name },
      pose, browOverrides: scaleOv,
      ...(proportions && lines ? {
        proportions: {
          lines: Object.fromEntries(Object.entries(lines).map(([key, p]) => [key, sc(p)])) as Record<LineKey, Pt>,
          hairlineEstimated, profile,
          thirds: proportions.thirds.map((t) => Math.round(t.mm * 10) / 10) as [number, number, number],
          spacingRatio: Math.round(proportions.spacing.ratio * 1000) / 1000,
          lengthToWidth: Math.round(proportions.lengthToWidth * 1000) / 1000,
        },
      } : {}),
    };
    try { await persist(rec); setCurrentId(rec.id); return rec; } finally { setSaving(false); }
  }, [photo, points, colour, combined, landmarks, useWhite, browStyle, drape, pose, browOverrides, proportions, lines, hairlineEstimated, profile, currentId, saved, persist]);

  return {
    photo, points, setPoints, landmarks, pose, status, busy, useWhite, setUseWhite, drape, setDrape, browStyle, setBrowStyle,
    browOverrides, setBrowOverrides, lines, moveLine, resetLines, detected, hairlineEstimated, currentId, saving,
    colour, combined, proportions, open, openFile, reset, save,
  };
}
export type FaceSession = ReturnType<typeof useFaceSession>;
