/**
 * On-device face landmark detection (MediaPipe Face Landmarker, 478 points incl. iris).
 * The WASM runtime and model are served from this app's own origin (copied at build time),
 * so after the first load it works offline and no image ever leaves the device for detection.
 */
import type { Pt } from './brows';
import { poseFromMatrix, type Pose } from './proportions';

let landmarkerPromise: Promise<unknown> | null = null;

export async function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const base = import.meta.env.BASE_URL;
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe-wasm`);
      const modelUrl = `${base}models/face_landmarker.task`;
      const head = await fetch(modelUrl, { method: 'HEAD' }).catch(() => null);
      if (!head || !head.ok) throw new Error('Face model not available in this build. Place the points by hand.');
      return FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
        runningMode: 'IMAGE', numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: true,
      });
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise as Promise<{ detect: (img: HTMLCanvasElement) => { faceLandmarks: { x: number; y: number }[][]; facialTransformationMatrixes?: { data: ArrayLike<number> }[] } }>;
}

export async function detectLandmarks(canvas: HTMLCanvasElement): Promise<{ points: Pt[]; pose: Pose | null } | null> {
  const lm = await loadLandmarker();
  const res = lm.detect(canvas);
  const face = res.faceLandmarks?.[0];
  if (!face || face.length < 478) return null;
  const m = res.facialTransformationMatrixes?.[0]?.data;
  return { points: face.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height })), pose: m && m.length >= 16 ? poseFromMatrix(m) : null };
}

export type PointKey = 'cheekL' | 'cheekR' | 'forehead' | 'chin' | 'hairTop' | 'hairSide' | 'eyeL' | 'eyeR' | 'browL' | 'browR' | 'white';
export interface SamplePoint { x: number; y: number; r: number; kind: 'skin' | 'hair' | 'eye' | 'brow' | 'white'; label: string }

/** Initial sample points from landmarks; radii scale with face width. */
export function pointsFromLandmarks(lm: Pt[]): Record<PointKey, SamplePoint> {
  const faceW = Math.hypot(lm[234].x - lm[454].x, lm[234].y - lm[454].y);
  const up = { x: lm[10].x - lm[152].x, y: lm[10].y - lm[152].y };
  const len = Math.hypot(up.x, up.y);
  const u = { x: up.x / len, y: up.y / len };
  const irisR = (c: number) => (Math.hypot(lm[c + 1].x - lm[c].x, lm[c + 1].y - lm[c].y) + Math.hypot(lm[c + 3].x - lm[c].x, lm[c + 3].y - lm[c].y)) / 2;
  const skinR = faceW * 0.045;
  const mid = (a: number, b: number, t = 0.5) => ({ x: lm[a].x + (lm[b].x - lm[a].x) * t, y: lm[a].y + (lm[b].y - lm[a].y) * t });
  const fh = mid(151, 10, 0.5);
  const left = lm[234].x < lm[454].x ? 234 : 454;
  return {
    cheekL: { ...lm[50], r: skinR, kind: 'skin', label: 'Cheek' },
    cheekR: { ...lm[280], r: skinR, kind: 'skin', label: 'Cheek' },
    forehead: { ...fh, r: skinR, kind: 'skin', label: 'Forehead' },
    chin: { ...mid(152, 17, 0.45), r: skinR * 0.8, kind: 'skin', label: 'Chin' },
    hairTop: { x: lm[10].x + u.x * len * 0.3, y: lm[10].y + u.y * len * 0.3, r: skinR, kind: 'hair', label: 'Hair' },
    hairSide: { x: lm[left].x - (lm[454].x - lm[234].x) * 0.06 * Math.sign(lm[454].x - lm[234].x) + u.x * len * 0.35, y: lm[left].y + u.y * len * 0.35, r: skinR * 0.8, kind: 'hair', label: 'Hair' },
    eyeL: { ...lm[468], r: irisR(468), kind: 'eye', label: 'Iris' },
    eyeR: { ...lm[473], r: irisR(473), kind: 'eye', label: 'Iris' },
    browL: { ...mid(105, 52), r: skinR * 0.45, kind: 'brow', label: 'Brow' },
    browR: { ...mid(334, 282), r: skinR * 0.45, kind: 'brow', label: 'Brow' },
    white: { x: lm[152].x, y: Math.min(lm[152].y + len * 0.35, lm[152].y + faceW), r: skinR, kind: 'white', label: 'White' },
  };
}

/** Fallback layout for a centred, upright selfie when the model is unavailable. */
export function defaultPoints(w: number, h: number): Record<PointKey, SamplePoint> {
  const fw = Math.min(w, h) * 0.45, cx = w / 2, cy = h * 0.48, r = fw * 0.05;
  return {
    cheekL: { x: cx - fw * 0.28, y: cy + fw * 0.15, r, kind: 'skin', label: 'Cheek' },
    cheekR: { x: cx + fw * 0.28, y: cy + fw * 0.15, r, kind: 'skin', label: 'Cheek' },
    forehead: { x: cx, y: cy - fw * 0.42, r, kind: 'skin', label: 'Forehead' },
    chin: { x: cx, y: cy + fw * 0.55, r: r * 0.8, kind: 'skin', label: 'Chin' },
    hairTop: { x: cx, y: cy - fw * 0.75, r, kind: 'hair', label: 'Hair' },
    hairSide: { x: cx - fw * 0.55, y: cy - fw * 0.35, r, kind: 'hair', label: 'Hair' },
    eyeL: { x: cx - fw * 0.2, y: cy - fw * 0.1, r: fw * 0.05, kind: 'eye', label: 'Iris' },
    eyeR: { x: cx + fw * 0.2, y: cy - fw * 0.1, r: fw * 0.05, kind: 'eye', label: 'Iris' },
    browL: { x: cx - fw * 0.22, y: cy - fw * 0.24, r: r * 0.5, kind: 'brow', label: 'Brow' },
    browR: { x: cx + fw * 0.22, y: cy - fw * 0.24, r: r * 0.5, kind: 'brow', label: 'Brow' },
    white: { x: cx, y: h * 0.92, r, kind: 'white', label: 'White' },
  };
}
